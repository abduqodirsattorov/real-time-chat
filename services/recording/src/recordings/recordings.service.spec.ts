import { Test } from '@nestjs/testing';
import { RecordingsService } from './recordings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { LiveKitEgressService } from '../livekit/livekit-egress.service';
import { MinioService } from '../minio/minio.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

const mockPrisma = {
  recording: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  call: { findUnique: jest.fn() },
};

const mockRabbitmq = { publish: jest.fn() };
const mockEgress = {
  startRoomEgress: jest.fn().mockResolvedValue('egress-abc'),
  stopEgress: jest.fn(),
};
const mockMinio = {
  storageKey: jest.fn().mockReturnValue('recordings/2026/05/call-1.mp3'),
  signedGetUrl: jest.fn().mockResolvedValue('https://minio/signed-url'),
};

const adminUser  = { sub: 'admin-1',    role: 'admin',      phone: '+1', locale: 'uz' };
const supUser    = { sub: 'sup-1',      role: 'supervisor', phone: '+2', locale: 'uz' };
const opUser     = { sub: 'op-1',       role: 'operator',   phone: '+3', locale: 'uz' };
const otherOp    = { sub: 'op-other',   role: 'operator',   phone: '+4', locale: 'uz' };
const custUser   = { sub: 'cust-1',     role: 'customer',   phone: '+5', locale: 'uz' };

const mockRequest = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };

describe('RecordingsService', () => {
  let service: RecordingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        RecordingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RabbitMQService, useValue: mockRabbitmq },
        { provide: LiveKitEgressService, useValue: mockEgress },
        { provide: MinioService, useValue: mockMinio },
      ],
    }).compile();
    service = module.get(RecordingsService);
  });

  // ── start() ──────────────────────────────────────────────────────────────────

  it('T1: start() begins Egress when consent announced', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      id: 'rec-1', callId: 'call-1', consentAnnounced: true, status: 'starting', startedAt: new Date(),
    });
    mockPrisma.recording.update.mockResolvedValue({ status: 'active', egressId: 'egress-abc' });

    const result = await service.start({ recordingId: 'rec-1', callId: 'call-1', livekitRoom: 'call-room-1' });
    expect(result.egressId).toBe('egress-abc');
    expect(mockEgress.startRoomEgress).toHaveBeenCalledWith('call-1', 'call-room-1');
    expect(mockMinio.storageKey).toHaveBeenCalledWith('call-1');
  });

  it('T2: start() throws BadRequest when consent NOT announced', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      id: 'rec-1', callId: 'call-1', consentAnnounced: false, status: 'starting',
    });
    await expect(service.start({ recordingId: 'rec-1', callId: 'call-1', livekitRoom: 'r1' }))
      .rejects.toThrow(BadRequestException);
    expect(mockEgress.startRoomEgress).not.toHaveBeenCalled();
  });

  it('T3: start() throws NotFound for unknown recording', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue(null);
    await expect(service.start({ recordingId: 'nonexistent', callId: 'c1', livekitRoom: 'r1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('T4: start() continues gracefully when Egress returns null (LiveKit unreachable)', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      id: 'rec-2', callId: 'call-2', consentAnnounced: true, status: 'starting', startedAt: new Date(),
    });
    mockEgress.startRoomEgress.mockResolvedValueOnce(null);
    mockPrisma.recording.update.mockResolvedValue({ status: 'starting', egressId: null });

    const result = await service.start({ recordingId: 'rec-2', callId: 'call-2', livekitRoom: 'r2' });
    expect(result.egressId).toBeNull();
  });

  // ── stop() ───────────────────────────────────────────────────────────────────

  it('T5: stop() stops active recording', async () => {
    const startedAt = new Date(Date.now() - 30_000);
    mockPrisma.recording.findUnique.mockResolvedValue({
      id: 'rec-1', egressId: 'egress-abc', status: 'active', startedAt,
    });
    mockPrisma.recording.update.mockResolvedValue({ status: 'processing' });

    const result = await service.stop({ recordingId: 'rec-1' });
    expect(result.status).toBe('processing');
    expect(mockEgress.stopEgress).toHaveBeenCalledWith('egress-abc');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('T6: stop() throws BadRequest for completed recording', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({ id: 'rec-1', status: 'completed', startedAt: new Date() });
    await expect(service.stop({ recordingId: 'rec-1' })).rejects.toThrow(BadRequestException);
  });

  // ── getRecording() access control ─────────────────────────────────────────────

  const recWithCall = {
    id: 'rec-1', callId: 'call-1', startedBy: 'op-1', status: 'completed',
    storageKey: 'recordings/2026/05/call-1.mp3', startedAt: new Date(), durationMs: 60000,
    call: { id: 'call-1', calleeId: 'op-1', callerId: 'cust-1' },
  };

  it('T7: admin can access any recording', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue(recWithCall);
    mockPrisma.auditLog.create.mockResolvedValue({});
    const result = await service.getRecording(adminUser, 'rec-1', mockRequest);
    expect(result.id).toBe('rec-1');
    expect(result.signedUrl).toBe('https://minio/signed-url');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'recording.accessed', actorId: 'admin-1' }) })
    );
  });

  it('T8: supervisor can access any recording', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue(recWithCall);
    mockPrisma.auditLog.create.mockResolvedValue({});
    const result = await service.getRecording(supUser, 'rec-1', mockRequest);
    expect(result.id).toBe('rec-1');
  });

  it('T9: call operator (startedBy) can access own recording', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue(recWithCall);
    mockPrisma.auditLog.create.mockResolvedValue({});
    const result = await service.getRecording(opUser, 'rec-1', mockRequest);
    expect(result.id).toBe('rec-1');
  });

  it('T10: unrelated operator gets 403', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      ...recWithCall,
      startedBy: 'op-other-person',
      call: { ...recWithCall.call, calleeId: 'op-different' },
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
    await expect(service.getRecording(otherOp, 'rec-1', mockRequest)).rejects.toThrow(ForbiddenException);
  });

  it('T11: customer gets 403', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue(recWithCall);
    await expect(service.getRecording(custUser, 'rec-1', mockRequest)).rejects.toThrow(ForbiddenException);
  });

  // ── webhook handlers ─────────────────────────────────────────────────────────

  it('T12: handleEgressEnded updates status to completed and fires RabbitMQ', async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({
      id: 'rec-1', callId: 'call-1', egressId: 'eg-1', status: 'active',
      startedAt: new Date(Date.now() - 60_000), storageKey: 'recordings/2026/05/call-1.mp3',
    });
    mockPrisma.recording.update.mockResolvedValue({ status: 'completed' });

    await service.handleEgressEnded('eg-1', { duration: 60, fileSize: 1024000, fileResults: [{ filename: 'recordings/2026/05/call-1.mp3' }] });

    expect(mockPrisma.recording.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed' }),
    }));
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('call.recording.completed', expect.objectContaining({ recording_id: 'rec-1' }));
  });

  it('T13: handleEgressFailed sets status to failed with reason', async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({ id: 'rec-1', callId: 'c1', egressId: 'eg-2' });
    mockPrisma.recording.update.mockResolvedValue({ status: 'failed' });

    await service.handleEgressFailed('eg-2', 'out_of_memory');

    expect(mockPrisma.recording.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'failed', failedReason: 'out_of_memory' },
    }));
  });

  it('T14: handleEgressStarted sets status to active', async () => {
    mockPrisma.recording.findFirst.mockResolvedValue({ id: 'rec-1', egressId: 'eg-3' });
    mockPrisma.recording.update.mockResolvedValue({ status: 'active' });

    await service.handleEgressStarted('eg-3');
    expect(mockPrisma.recording.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'active' } }));
  });

  it('T15: getRecording returns signedUrl only for completed status', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      ...recWithCall,
      status: 'processing',
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
    const result = await service.getRecording(adminUser, 'rec-1', mockRequest);
    expect(result.signedUrl).toBeNull();
    expect(mockMinio.signedGetUrl).not.toHaveBeenCalled();
  });

  it('T16: getByCall returns recordings for operator', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);
    const result = await service.getByCall(opUser, 'call-1');
    expect(result.recordings).toHaveLength(2);
  });

  it('T17: getByCall throws Forbidden for customer', async () => {
    await expect(service.getByCall(custUser, 'call-1')).rejects.toThrow(ForbiddenException);
  });
});
