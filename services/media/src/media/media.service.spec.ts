import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MinioService } from '../minio/minio.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ALLOWED_MIME_TYPES } from './dto/presign.dto';

const mockPrisma = {
  attachment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockMinio = {
  presignedPutUrl: jest.fn(),
  presignedGetUrl: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn(),
  statObject: jest.fn(),
};
const mockRabbitmq = { publish: jest.fn(), consume: jest.fn().mockResolvedValue(undefined) };

const user = { sub: 'user-uuid-1', role: 'customer', locale: 'uz' };

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: MinioService, useValue: mockMinio },
        { provide: RabbitMQService, useValue: mockRabbitmq },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  // ── 1. ALLOWED_MIME_TYPES coverage ─────────────────────────────────────────
  it('1. ALLOWED_MIME_TYPES contains image/jpeg with 10MB limit', () => {
    expect(ALLOWED_MIME_TYPES['image/jpeg'].maxBytes).toBe(10 * 1024 * 1024);
    expect(ALLOWED_MIME_TYPES['image/jpeg'].ext).toBe('jpg');
  });

  it('2. ALLOWED_MIME_TYPES contains video/mp4 with 100MB limit', () => {
    expect(ALLOWED_MIME_TYPES['video/mp4'].maxBytes).toBe(100 * 1024 * 1024);
  });

  it('3. ALLOWED_MIME_TYPES contains application/pdf with 25MB limit', () => {
    expect(ALLOWED_MIME_TYPES['application/pdf'].maxBytes).toBe(25 * 1024 * 1024);
  });

  // ── 2. presign ─────────────────────────────────────────────────────────────
  it('4. presign rejects unknown MIME type', async () => {
    await expect(
      service.presign(user as any, { fileName: 'x.exe', mimeType: 'application/x-msdownload', fileSize: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('5. presign rejects file exceeding size limit', async () => {
    await expect(
      service.presign(user as any, { fileName: 'big.jpg', mimeType: 'image/jpeg', fileSize: 20 * 1024 * 1024 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('6. presign returns uploadId and uploadUrl on valid input', async () => {
    mockMinio.presignedPutUrl.mockResolvedValue('http://minio/put-url');
    mockRedis.set.mockResolvedValue(undefined);

    const result = await service.presign(user as any, {
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
    });

    expect(result.uploadId).toBeDefined();
    expect(result.uploadUrl).toBe('http://minio/put-url');
    expect(result.expiresIn).toBe(3600);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('7. presign builds storage key with YYYY/MM/DD/{uuid}.ext format', async () => {
    mockMinio.presignedPutUrl.mockResolvedValue('http://minio/put-url');
    mockRedis.set.mockResolvedValue(undefined);

    const result = await service.presign(user as any, {
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileSize: 1000,
    });

    expect(result.storageKey).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.pdf$/);
  });

  it('8. presign sanitizes dangerous filenames', async () => {
    mockMinio.presignedPutUrl.mockResolvedValue('http://minio/put-url');
    mockRedis.set.mockResolvedValue(undefined);

    await service.presign(user as any, {
      fileName: '../../../etc/passwd',
      mimeType: 'image/png',
      fileSize: 100,
    });

    const saved = JSON.parse(mockRedis.set.mock.calls[0][1]);
    expect(saved.fileName).not.toContain('/');
    expect(saved.fileName).not.toContain('..');
  });

  // ── 3. confirm ─────────────────────────────────────────────────────────────
  it('9. confirm throws NotFoundException if upload session missing', async () => {
    mockRedis.get.mockResolvedValue(null);
    await expect(
      service.confirm(user as any, { uploadId: 'no-such-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('10. confirm throws ForbiddenException if uploaderId mismatch', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({
      uploaderId: 'other-user',
      storageKey: '2024/01/01/x.jpg',
      mimeType: 'image/jpeg',
      fileName: 'x.jpg',
      fileSize: 100,
      uploadedAt: Date.now(),
    }));

    await expect(
      service.confirm(user as any, { uploadId: 'some-id' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('11. confirm throws BadRequestException if file not in MinIO', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({
      uploaderId: user.sub,
      storageKey: '2024/01/01/x.jpg',
      mimeType: 'image/jpeg',
      fileName: 'x.jpg',
      fileSize: 100,
      uploadedAt: Date.now(),
    }));
    mockMinio.statObject.mockRejectedValue(new Error('Not Found'));

    await expect(
      service.confirm(user as any, { uploadId: 'some-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('12. confirm creates attachment and publishes media.uploaded', async () => {
    const state = {
      uploaderId: user.sub,
      storageKey: '2024/01/01/abc.jpg',
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      fileSize: 2048,
      uploadedAt: Date.now(),
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(state));
    mockMinio.statObject.mockResolvedValue({ size: 2048 });
    mockMinio.getObject.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic
    mockPrisma.attachment.create.mockResolvedValue({
      id: 'att-1', ...state, sizeBytes: BigInt(2048), thumbnailKey: null, createdAt: new Date(),
    });
    mockRedis.del.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.confirm(user as any, { uploadId: 'some-id' });

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storageKey: state.storageKey }) }),
    );
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('media.uploaded', expect.objectContaining({
      attachment_id: 'att-1',
    }));
    expect(mockRedis.del).toHaveBeenCalled();
    expect(result.sizeBytes).toBe('2048');
  });

  // ── 4. getAttachment ───────────────────────────────────────────────────────
  it('13. getAttachment throws NotFoundException for unknown id', async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(null);
    await expect(service.getAttachment(user as any, 'bad-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('14. getAttachment returns attachment with presigned url', async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      id: 'att-2', storageKey: '2024/01/01/x.jpg', sizeBytes: BigInt(1024), uploaderId: user.sub,
    });
    mockMinio.presignedGetUrl.mockResolvedValue('http://minio/get-url');

    const result = await service.getAttachment(user as any, 'att-2');
    expect(result.url).toBe('http://minio/get-url');
    expect(result.sizeBytes).toBe('1024');
  });

  // ── 5. getThumbnail ────────────────────────────────────────────────────────
  it('15. getThumbnail falls back to original if no thumbnailKey', async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      id: 'att-3', storageKey: '2024/01/01/x.mp4', thumbnailKey: null, sizeBytes: BigInt(0), uploaderId: user.sub,
    });
    mockMinio.presignedGetUrl.mockResolvedValue('http://minio/original');

    const result = await service.getThumbnail(user as any, 'att-3');
    expect(result.isThumbnail).toBe(false);
    expect(result.url).toBe('http://minio/original');
  });

  // ── 6. voice upload ────────────────────────────────────────────────────────
  it('16. uploadVoice rejects non-audio MIME', async () => {
    const file = { buffer: Buffer.from('x'), size: 100, mimetype: 'image/jpeg', originalname: 'x.jpg' };
    await expect(
      service.uploadVoice(user as any, file as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('17. uploadVoice rejects file exceeding 10MB', async () => {
    const file = {
      buffer: Buffer.alloc(11 * 1024 * 1024), size: 11 * 1024 * 1024,
      mimetype: 'audio/mpeg', originalname: 'voice.mp3',
    };
    await expect(
      service.uploadVoice(user as any, file as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('18. uploadVoice stores to MinIO and returns url', async () => {
    const buf = Buffer.from([0x49, 0x44, 0x33]); // ID3 (mp3 magic)
    const file = { buffer: buf, size: buf.length, mimetype: 'audio/mpeg', originalname: 'voice.mp3' };
    mockMinio.putObject.mockResolvedValue(undefined);
    mockPrisma.attachment.create.mockResolvedValue({
      id: 'voice-1', storageKey: '2024/01/01/x.mp3', sizeBytes: BigInt(buf.length),
    });
    mockMinio.presignedGetUrl.mockResolvedValue('http://minio/voice.mp3');
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.uploadVoice(user as any, file as any);
    expect(result.url).toBe('http://minio/voice.mp3');
    expect(mockMinio.putObject).toHaveBeenCalled();
  });
});
