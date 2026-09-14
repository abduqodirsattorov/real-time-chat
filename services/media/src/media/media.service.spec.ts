import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MinioService } from '../minio/minio.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ALLOWED_MIME_TYPES } from './dto/presign.dto';
import { Readable } from 'stream';
import { readFile, access } from 'fs/promises';
import * as antivirus from './clamav';
import { ServiceUnavailableException } from '@nestjs/common';

const mockPrisma = {
  attachment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  message: { findFirst: jest.fn() },
  room: { findUnique: jest.fn() },
  roomMember: { findFirst: jest.fn() },
  operatorProduct: { findFirst: jest.fn() },
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockMinio = {
  presignedPutUrl: jest.fn(),
  presignedGetUrl: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn(),
  statObject: jest.fn(),
  getObjectStream: jest.fn(),
  putFile: jest.fn(),
  deleteObject: jest.fn().mockResolvedValue(undefined),
};
const mockRabbitmq = { publish: jest.fn(), consume: jest.fn().mockResolvedValue(undefined) };

const user = { sub: 'user-uuid-1', role: 'customer', locale: 'uz' };

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockPrisma.roomMember.findFirst.mockResolvedValue(null);
    mockPrisma.operatorProduct.findFirst.mockResolvedValue(null);
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

  describe('attachment tenant isolation', () => {
    const operator = { sub: 'operator-a', role: 'operator', locale: 'uz' };
    const attachment = { id: 'foreign-attachment', uploaderId: 'other', storageKey: 'private/file.jpg', thumbnailKey: 'private/thumb.jpg', sizeBytes: BigInt(10) };

    beforeEach(() => {
      mockPrisma.attachment.findUnique.mockResolvedValue(attachment);
      mockPrisma.message.findFirst.mockResolvedValue({ roomId: 'foreign-room' });
    });

    it.each(['product-b', null])('denies original and thumbnail URLs for inaccessible product %s', async productId => {
      mockPrisma.room.findUnique.mockResolvedValue({ productId });
      await expect(service.getAttachment(operator, attachment.id)).rejects.toThrow(ForbiddenException);
      await expect(service.getThumbnail(operator, attachment.id)).rejects.toThrow(ForbiddenException);
      expect(mockMinio.presignedGetUrl).not.toHaveBeenCalled();
    });

    it('denies staff access when the attachment room no longer exists', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);
      await expect(service.getAttachment(operator, attachment.id)).rejects.toThrow(ForbiddenException);
      expect(mockMinio.presignedGetUrl).not.toHaveBeenCalled();
    });

    it('allows active members of a productless room', async () => {
      mockPrisma.roomMember.findFirst.mockResolvedValue({ userId: operator.sub, leftAt: null });
      mockMinio.presignedGetUrl.mockResolvedValue('signed-url');
      await expect(service.getAttachment(operator, attachment.id)).resolves.toHaveProperty('url', 'signed-url');
      expect(mockPrisma.roomMember.findFirst).toHaveBeenCalledWith({
        where: { roomId: 'foreign-room', userId: operator.sub, leftAt: null },
      });
    });

    it('allows staff assigned to the attachment product', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({ productId: 'product-a' });
      mockPrisma.operatorProduct.findFirst.mockResolvedValue({ productId: 'product-a' });
      mockMinio.presignedGetUrl.mockResolvedValue('signed-url');
      await expect(service.getThumbnail(operator, attachment.id)).resolves.toHaveProperty('url', 'signed-url');
      expect(mockPrisma.operatorProduct.findFirst).toHaveBeenCalledWith({ where: { userId: operator.sub, productId: 'product-a' } });
    });
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

    expect(result.storageKey).toMatch(/^uploads\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.pdf$/);
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
    const bytes = Buffer.alloc(2048);
    bytes.set([0xff, 0xd8, 0xff]);
    mockMinio.getObjectStream.mockResolvedValue(Readable.from([bytes]));
    mockPrisma.attachment.create.mockResolvedValue({
      id: 'att-1', ...state, sizeBytes: BigInt(2048), thumbnailKey: null, createdAt: new Date(),
    });
    mockRedis.del.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.confirm(user as any, { uploadId: 'some-id' });

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storageKey: expect.not.stringMatching(/^2024\/01\/01\/abc.jpg$/) }) }),
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
    const buf = Buffer.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0]);
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

  describe('upload validation and antivirus', () => {
    const bytes = Buffer.from('%PDF-1.7\nunit test document');
    const state = { uploaderId: user.sub, storageKey: 'uploads/pending.pdf', mimeType: 'application/pdf', fileName: 'test.pdf', fileSize: bytes.length };

    beforeEach(() => {
      mockRedis.get.mockResolvedValue(JSON.stringify(state));
      mockMinio.statObject.mockResolvedValue({ size: bytes.length });
      mockMinio.getObjectStream.mockImplementation(async () => Readable.from([bytes]));
      mockPrisma.attachment.create.mockImplementation(async ({ data }) => ({ id: 'validated', ...data }));
      jest.spyOn(antivirus, 'scanWithClamAV').mockImplementation(async source => { for await (const _ of source) {} });
    });

    it('scans a snapshot and stores the same bytes under a new non-upload key', async () => {
      let snapshot: string;
      mockMinio.putFile.mockImplementation(async (key, file) => {
        snapshot = file;
        expect(await readFile(file)).toEqual(bytes);
        expect(key).not.toBe(state.storageKey);
        expect(key).not.toMatch(/^uploads\//);
        expect(antivirus.scanWithClamAV).toHaveBeenCalledTimes(1);
      });
      const result = await service.confirm(user, { uploadId: 'pending' });
      expect(result.storageKey).toBe(mockMinio.putFile.mock.calls[0][0]);
      expect(mockMinio.getObject).not.toHaveBeenCalled();
      await expect(access(snapshot)).rejects.toThrow();
    });

    it.each([0, bytes.length + 1, 26 * 1024 * 1024])('rejects an invalid stat size %s before downloading', async size => {
      mockMinio.statObject.mockResolvedValue({ size });
      await expect(service.confirm(user, { uploadId: 'pending' })).rejects.toThrow(BadRequestException);
      expect(mockMinio.getObjectStream).not.toHaveBeenCalled();
      expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
    });

    it('aborts a stream that grows beyond the checked object size', async () => {
      mockMinio.getObjectStream.mockResolvedValue(Readable.from([bytes, Buffer.from('extra bytes')]));
      await expect(service.confirm(user, { uploadId: 'pending' })).rejects.toThrow(BadRequestException);
      expect(antivirus.scanWithClamAV).not.toHaveBeenCalled();
      expect(mockMinio.putFile).not.toHaveBeenCalled();
    });

    it('rejects unknown file contents even if the declared MIME is allowed', async () => {
      mockMinio.getObjectStream.mockResolvedValue(Readable.from([Buffer.alloc(bytes.length)]));
      await expect(service.confirm(user, { uploadId: 'pending' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
    });

    it('rejects a detected MIME mismatch', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ ...state, mimeType: 'image/jpeg' }));
      await expect(service.confirm(user, { uploadId: 'pending' })).rejects.toThrow(BadRequestException);
      expect(mockMinio.putFile).not.toHaveBeenCalled();
    });

    it.each([new BadRequestException('Malware'), new ServiceUnavailableException('Scanner offline')])('never publishes an attachment on scan failure: %s', async error => {
      (antivirus.scanWithClamAV as jest.Mock).mockImplementation(async source => { source.destroy(); throw error; });
      await expect(service.confirm(user, { uploadId: 'pending' })).rejects.toBe(error);
      expect(mockMinio.putFile).not.toHaveBeenCalled();
      expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
      expect(mockRabbitmq.publish).not.toHaveBeenCalled();
    });

    it('scans voice uploads before saving or issuing a URL', async () => {
      const buffer = Buffer.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0]);
      const file = { buffer, size: buffer.length, mimetype: 'audio/mpeg', originalname: 'voice.mp3' } as Express.Multer.File;
      (antivirus.scanWithClamAV as jest.Mock).mockRejectedValue(new BadRequestException('Malware'));
      await expect(service.uploadVoice(user, file)).rejects.toThrow(BadRequestException);
      expect(mockMinio.putObject).not.toHaveBeenCalled();
      expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
      expect(mockMinio.presignedGetUrl).not.toHaveBeenCalled();
    });
  });
});
