import { Test } from '@nestjs/testing';
import { CallsService } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { LiveKitService } from '../livekit/livekit.service';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';

const mockPrisma = {
  call: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  callTransfer: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  callQueue: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  recording: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  operatorState: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockRedis = { setnx: jest.fn(), del: jest.fn(), get: jest.fn(), isOnline: jest.fn() };
const mockRabbitmq = { publish: jest.fn() };
const mockCentrifugo = { publishToUser: jest.fn(), publish: jest.fn(), playAudioToCall: jest.fn(), publishToRoom: jest.fn() };
const mockLivekit = {
  createRoom: jest.fn(),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
  removeParticipant: jest.fn(),
  destroyRoom: jest.fn(),
  mutePublishedTrack: jest.fn(),
  startRecordingEgress: jest.fn().mockResolvedValue('egress-123'),
  stopEgress: jest.fn(),
};

const operatorUser = { sub: 'op-1', phone: '+998901234567', role: 'operator', locale: 'uz' };
const customerUser = { sub: 'cust-1', phone: '+998901234568', role: 'customer', locale: 'uz' };

describe('CallsService', () => {
  let service: CallsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CallsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: RabbitMQService, useValue: mockRabbitmq },
        { provide: CentrifugoService, useValue: mockCentrifugo },
        { provide: LiveKitService, useValue: mockLivekit },
      ],
    }).compile();
    service = module.get(CallsService);
  });

  // ── initiateCall ──────────────────────────────────────────────────────────────

  it('T1: initiateCall queues when no operator available', async () => {
    mockPrisma.call.create.mockResolvedValue({ id: 'call-1', livekitRoom: 'call-room-1', callerId: 'cust-1', metadata: {} });
    mockPrisma.operatorState.findMany.mockResolvedValue([]);
    mockPrisma.call.update.mockResolvedValue({});
    mockPrisma.callQueue.create.mockResolvedValue({});
    mockRabbitmq.publish.mockResolvedValue(undefined);
    mockCentrifugo.playAudioToCall.mockResolvedValue(undefined);

    const result = await service.initiateCall(customerUser, {});
    expect(result.status).toBe('queued');
    expect(mockPrisma.callQueue.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ callId: 'call-1' }) }));
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('call.initiated', expect.objectContaining({ status: 'queued' }));
  });

  it('T2: initiateCall assigns operator when available', async () => {
    mockPrisma.call.create.mockResolvedValue({ id: 'call-2', livekitRoom: 'room-2', callerId: 'cust-1', metadata: {} });
    mockPrisma.operatorState.findMany.mockResolvedValue([{ userId: 'op-1', activeChats: 0, maxConcurrentChats: 3 }]);
    mockRedis.setnx.mockResolvedValue(true);
    mockPrisma.call.update.mockResolvedValue({ id: 'call-2', calleeId: 'op-1', status: 'ringing', metadata: {} });
    mockCentrifugo.publishToUser.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.initiateCall(customerUser, {});
    expect(result.status).toBe('ringing');
    expect(mockCentrifugo.publishToUser).toHaveBeenCalledWith('op-1', 'call.incoming', expect.any(Object));
  });

  it('T3: initiateCall skips operator with full capacity', async () => {
    mockPrisma.call.create.mockResolvedValue({ id: 'call-3', livekitRoom: 'room-3', callerId: 'cust-1', metadata: {} });
    mockPrisma.operatorState.findMany.mockResolvedValue([
      { userId: 'op-full', activeChats: 3, maxConcurrentChats: 3 },
    ]);
    mockPrisma.call.update.mockResolvedValue({});
    mockPrisma.callQueue.create.mockResolvedValue({});
    mockRabbitmq.publish.mockResolvedValue(undefined);
    mockCentrifugo.playAudioToCall.mockResolvedValue(undefined);

    const result = await service.initiateCall(customerUser, {});
    expect(result.status).toBe('queued');
  });

  it('T4: operator claim race — second claim returns false', async () => {
    mockPrisma.call.create.mockResolvedValue({ id: 'call-4', livekitRoom: 'room-4', callerId: 'cust-1', metadata: {} });
    mockPrisma.operatorState.findMany.mockResolvedValue([{ userId: 'op-busy', activeChats: 0, maxConcurrentChats: 3 }]);
    mockRedis.setnx.mockResolvedValue(false); // claim fails
    mockPrisma.call.update.mockResolvedValue({});
    mockPrisma.callQueue.create.mockResolvedValue({});
    mockRabbitmq.publish.mockResolvedValue(undefined);
    mockCentrifugo.playAudioToCall.mockResolvedValue(undefined);

    const result = await service.initiateCall(customerUser, {});
    expect(result.status).toBe('queued');
  });

  // ── answerCall ────────────────────────────────────────────────────────────────

  it('T5: answerCall succeeds for the right operator', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', calleeId: 'op-1', callerId: 'cust-1', status: 'ringing', livekitRoom: 'room-1' });
    mockPrisma.call.update.mockResolvedValue({ status: 'connected' });
    mockCentrifugo.publish.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.answerCall(operatorUser, 'c1');
    expect(result.status).toBe('connected');
    expect(mockLivekit.generateToken).toHaveBeenCalledTimes(2);
  });

  it('T6: answerCall throws Forbidden for wrong operator', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', calleeId: 'op-other', callerId: 'cust-1', status: 'ringing', livekitRoom: 'room-1' });
    await expect(service.answerCall(operatorUser, 'c1')).rejects.toThrow(ForbiddenException);
  });

  it('T7: answerCall throws BadRequest when not ringing', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', calleeId: 'op-1', callerId: 'cust-1', status: 'connected', livekitRoom: 'room-1' });
    await expect(service.answerCall(operatorUser, 'c1')).rejects.toThrow(BadRequestException);
  });

  // ── hangupCall ────────────────────────────────────────────────────────────────

  it('T8: hangupCall completes a connected call', async () => {
    const answeredAt = new Date(Date.now() - 60_000);
    mockPrisma.call.findUnique.mockResolvedValue({
      id: 'c1', status: 'connected', calleeId: 'op-1', callerId: 'cust-1',
      livekitRoom: 'room-1', answeredAt,
    });
    mockPrisma.call.update.mockResolvedValue({ status: 'completed' });
    mockLivekit.destroyRoom.mockResolvedValue(undefined);
    mockCentrifugo.publish.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);
    mockPrisma.callQueue.findFirst.mockResolvedValue(null);

    const result = await service.hangupCall(operatorUser, 'c1');
    expect(result.status).toBe('completed');
    expect(mockLivekit.destroyRoom).toHaveBeenCalledWith('room-1');
  });

  it('T9: hangupCall on ringing call sets no_answer', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({
      id: 'c2', status: 'ringing', calleeId: 'op-1', callerId: 'cust-1',
      livekitRoom: 'room-2', answeredAt: null,
    });
    mockPrisma.call.update.mockResolvedValue({ status: 'no_answer' });
    mockLivekit.destroyRoom.mockResolvedValue(undefined);
    mockCentrifugo.publish.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);
    mockPrisma.callQueue.findFirst.mockResolvedValue(null);

    const result = await service.hangupCall(operatorUser, 'c2');
    expect(result.status).toBe('no_answer');
  });

  // ── outboundCall ──────────────────────────────────────────────────────────────

  it('T10: outboundCall forbidden for customer', async () => {
    await expect(service.outboundCall(customerUser, { calleeId: 'u-1' })).rejects.toThrow(ForbiddenException);
  });

  it('T11: outboundCall succeeds for operator', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'cust-1', fullName: 'Test' });
    mockPrisma.call.create.mockResolvedValue({ id: 'c-out', callerId: 'op-1', calleeId: 'cust-1', status: 'ringing', livekitRoom: 'room-out', metadata: {} });
    mockRedis.isOnline.mockResolvedValue(true);
    mockCentrifugo.publishToUser.mockResolvedValue(undefined);
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.outboundCall(operatorUser, { calleeId: 'cust-1' });
    expect(result.status).toBe('ringing');
    expect(mockCentrifugo.publishToUser).toHaveBeenCalledWith('cust-1', 'call.incoming', expect.any(Object));
  });

  it('T12: outboundCall sends VoIP push flag when user offline', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'cust-1' });
    mockPrisma.call.create.mockResolvedValue({ id: 'c-out2', callerId: 'op-1', calleeId: 'cust-1', status: 'ringing', livekitRoom: 'room-out2', metadata: {} });
    mockRedis.isOnline.mockResolvedValue(false);
    mockRabbitmq.publish.mockResolvedValue(undefined);

    await service.outboundCall(operatorUser, { calleeId: 'cust-1' });
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('call.initiated', expect.objectContaining({ voip_push_needed: true }));
    expect(mockCentrifugo.publishToUser).not.toHaveBeenCalled();
  });

  // ── Recording consent flow ────────────────────────────────────────────────────

  it('T13: startRecording creates record with consentAnnounced=false', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', status: 'connected', metadata: { locale: 'uz' } });
    mockPrisma.recording.findFirst.mockResolvedValue(null);
    mockPrisma.recording.create.mockResolvedValue({ id: 'rec-1', consentAnnounced: false, status: 'starting', startedAt: new Date(), callId: 'c1' });
    mockCentrifugo.playAudioToCall.mockResolvedValue(undefined);

    const result = await service.startRecording(operatorUser, 'c1');
    expect(result.consentAnnounced).toBe(false);
    expect(result.status).toBe('starting');
  });

  it('T14: recordingConsentAck starts Egress only after consent', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      id: 'rec-1', callId: 'c1', status: 'starting', consentAnnounced: false, startedAt: new Date(),
    });
    mockPrisma.recording.update.mockResolvedValue({ id: 'rec-1', status: 'active', egressId: 'egress-123' });
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.recordingConsentAck(operatorUser, 'c1', 'rec-1');
    expect(mockLivekit.startRecordingEgress).toHaveBeenCalledWith('c1', 'rec-1');
    expect(result.status).toBe('active');
  });

  it('T15: recordingConsentAck throws if already announced', async () => {
    mockPrisma.recording.findUnique.mockResolvedValue({
      id: 'rec-1', callId: 'c1', status: 'starting', consentAnnounced: true, startedAt: new Date(),
    });
    await expect(service.recordingConsentAck(operatorUser, 'c1', 'rec-1')).rejects.toThrow(ConflictException);
  });

  it('T16: startRecording forbidden for customer', async () => {
    await expect(service.startRecording(customerUser, 'c1')).rejects.toThrow(ForbiddenException);
  });

  it('T17: startRecording fails on non-connected call', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', status: 'queued', metadata: {} });
    await expect(service.startRecording(operatorUser, 'c1')).rejects.toThrow(BadRequestException);
  });

  it('T18: stopRecording stops active recording', async () => {
    const startedAt = new Date(Date.now() - 30_000);
    mockPrisma.recording.findFirst.mockResolvedValue({ id: 'rec-1', callId: 'c1', egressId: 'egress-123', startedAt, status: 'active' });
    mockPrisma.recording.update.mockResolvedValue({ status: 'processing' });
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.stopRecording(operatorUser, 'c1');
    expect(result.status).toBe('processing');
    expect(mockLivekit.stopEgress).toHaveBeenCalledWith('egress-123');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  // ── Transfer ──────────────────────────────────────────────────────────────────

  it('T19: cold transfer forbidden for customer', async () => {
    await expect(service.transferCall(customerUser, 'c1', { type: 'cold', toOperatorId: 'op-2' })).rejects.toThrow(ForbiddenException);
  });

  it('T20: cold transfer disconnects operator A and notifies B', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', status: 'connected', calleeId: 'op-1', callerId: 'cust-1', livekitRoom: 'room-1' });
    mockPrisma.callTransfer.create.mockResolvedValue({ id: 'tr-1', callId: 'c1', fromOperator: 'op-1', toOperator: 'op-2', type: 'cold', status: 'initiated', consultRoom: null });
    mockPrisma.call.update.mockResolvedValue({});
    mockLivekit.removeParticipant.mockResolvedValue(undefined);
    mockCentrifugo.publishToUser.mockResolvedValue(undefined);
    mockPrisma.callTransfer.update.mockResolvedValue({});
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.transferCall(operatorUser, 'c1', { type: 'cold', toOperatorId: 'op-2' });
    expect(result.type).toBe('cold');
    expect(result.status).toBe('completed');
    expect(mockLivekit.removeParticipant).toHaveBeenCalledWith('room-1', 'op-1');
    expect(mockCentrifugo.publishToUser).toHaveBeenCalledWith('op-2', 'call.transfer.incoming', expect.any(Object));
  });

  it('T21: warm transfer creates consult room and sets call on_hold', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', status: 'connected', calleeId: 'op-1', callerId: 'cust-1', livekitRoom: 'room-1' });
    mockPrisma.callTransfer.create.mockResolvedValue({ id: 'tr-1', callId: 'c1', fromOperator: 'op-1', toOperator: 'op-2', type: 'warm', status: 'initiated', consultRoom: 'consult-c1' });
    mockLivekit.createRoom.mockResolvedValue(undefined);
    mockPrisma.call.update.mockResolvedValue({});
    mockCentrifugo.playAudioToCall.mockResolvedValue(undefined);
    mockCentrifugo.publishToUser.mockResolvedValue(undefined);
    mockPrisma.callTransfer.update.mockResolvedValue({});

    const result = await service.transferCall(operatorUser, 'c1', { type: 'warm', toOperatorId: 'op-2' }) as any;
    expect(result.type).toBe('warm');
    expect(result.status).toBe('consulting');
    expect(result.consultRoom).toBe('consult-c1');
    expect(mockLivekit.createRoom).toHaveBeenCalledWith('consult-c1');
  });

  it('T22: completeWarmTransfer removes A and promotes B', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', status: 'on_hold', calleeId: 'op-1', callerId: 'cust-1', livekitRoom: 'room-1' });
    mockPrisma.callTransfer.findFirst.mockResolvedValue({ id: 'tr-1', callId: 'c1', fromOperator: 'op-1', toOperator: 'op-2', type: 'warm', status: 'consulting' });
    mockLivekit.removeParticipant.mockResolvedValue(undefined);
    mockLivekit.destroyRoom.mockResolvedValue(undefined);
    mockPrisma.call.update.mockResolvedValue({});
    mockPrisma.callTransfer.update.mockResolvedValue({});
    mockRabbitmq.publish.mockResolvedValue(undefined);

    const result = await service.completeWarmTransfer(operatorUser, 'c1');
    expect(result.status).toBe('completed');
    expect(mockLivekit.removeParticipant).toHaveBeenCalledWith('room-1', 'op-1');
    expect(mockLivekit.destroyRoom).toHaveBeenCalledWith('consult-c1');
  });

  it('T23: cancelWarmTransfer restores call to connected', async () => {
    mockPrisma.call.findUnique.mockResolvedValue({ id: 'c1', status: 'on_hold', calleeId: 'op-1', livekitRoom: 'room-1' });
    mockPrisma.callTransfer.findFirst.mockResolvedValue({ id: 'tr-1', callId: 'c1', fromOperator: 'op-1', toOperator: 'op-2', type: 'warm', status: 'consulting' });
    mockLivekit.destroyRoom.mockResolvedValue(undefined);
    mockPrisma.call.update.mockResolvedValue({});
    mockPrisma.callTransfer.update.mockResolvedValue({});

    const result = await service.cancelWarmTransfer(operatorUser, 'c1');
    expect(result.status).toBe('canceled');
    expect(mockLivekit.destroyRoom).toHaveBeenCalledWith('consult-c1');
  });

  it('T24: getCall throws NotFound for unknown id', async () => {
    mockPrisma.call.findUnique.mockResolvedValue(null);
    await expect(service.getCall('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('T25: getCalls returns paginated result for customer', async () => {
    mockPrisma.call.findMany.mockResolvedValue([{ id: 'c1' }]);
    mockPrisma.call.count.mockResolvedValue(1);

    const result = await service.getCalls(customerUser, 20, 0);
    expect(result.total).toBe(1);
    expect(result.calls).toHaveLength(1);
  });
});
