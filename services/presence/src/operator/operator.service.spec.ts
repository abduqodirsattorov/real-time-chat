import { Test, TestingModule } from '@nestjs/testing';
import { OperatorService } from './operator.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperatorStatusEnum } from './dto/update-status.dto';
import * as crypto from 'crypto';

const mockPrisma = {
  operatorState: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockRedis = {
  atomicStatusUpdate: jest.fn(),
  removeFromAvailable: jest.fn(),
  addToAvailable: jest.fn(),
  getAvailableOperators: jest.fn(),
  getPresence: jest.fn(),
  getPresenceBulk: jest.fn(),
  setPresence: jest.fn(),
};

const mockRabbitmq = { publish: jest.fn() };

const operatorUser = { sub: 'op-uuid-1', role: 'operator', locale: 'uz' };
const customerUser = { sub: 'cust-uuid-1', role: 'customer', locale: 'uz' };
const supervisorUser = { sub: 'sup-uuid-1', role: 'supervisor', locale: 'uz' };

describe('OperatorService', () => {
  let operatorSvc: OperatorService;
  let presenceSvc: PresenceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperatorService,
        PresenceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: RabbitMQService, useValue: mockRabbitmq },
      ],
    }).compile();

    operatorSvc = module.get<OperatorService>(OperatorService);
    presenceSvc = module.get<PresenceService>(PresenceService);
  });

  // ── 1. Status guard ───────────────────────────────────────────────────────────
  it('1. customer cannot change operator status', async () => {
    await expect(
      operatorSvc.updateStatus(customerUser as any, { status: OperatorStatusEnum.available }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('2. throws NotFoundException if operator_state missing', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue(null);
    await expect(
      operatorSvc.updateStatus(operatorUser as any, { status: OperatorStatusEnum.available }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── 2. Status transitions ─────────────────────────────────────────────────────
  it('3. offline → available: adds to ZSET and publishes event', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({ userId: 'op-uuid-1', status: 'offline', activeChats: 0 });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockRedis.atomicStatusUpdate.mockResolvedValue(undefined);

    const result = await operatorSvc.updateStatus(operatorUser as any, { status: OperatorStatusEnum.available });

    expect(mockRedis.atomicStatusUpdate).toHaveBeenCalledWith('op-uuid-1', 'available', 0);
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('operator.status.changed', expect.objectContaining({
      user_id: 'op-uuid-1', old_status: 'offline', new_status: 'available',
    }));
    expect(result.status).toBe('available');
    expect(result.previous).toBe('offline');
  });

  it('4. available → busy: removes from ZSET', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({ userId: 'op-uuid-1', status: 'available', activeChats: 2 });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockRedis.atomicStatusUpdate.mockResolvedValue(undefined);

    await operatorSvc.updateStatus(operatorUser as any, { status: OperatorStatusEnum.busy });

    expect(mockRedis.atomicStatusUpdate).toHaveBeenCalledWith('op-uuid-1', 'busy', 2);
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('operator.status.changed', expect.objectContaining({
      new_status: 'busy',
    }));
  });

  it('5. on_call → available: publishes correct transition', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({ userId: 'op-uuid-1', status: 'on_call', activeChats: 1 });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockRedis.atomicStatusUpdate.mockResolvedValue(undefined);

    const result = await operatorSvc.updateStatus(operatorUser as any, { status: OperatorStatusEnum.available });
    expect(result.previous).toBe('on_call');
    expect(result.status).toBe('available');
  });

  it('6. supervisor can change status', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({ userId: 'sup-uuid-1', status: 'offline', activeChats: 0 });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockRedis.atomicStatusUpdate.mockResolvedValue(undefined);

    const result = await operatorSvc.updateStatus(supervisorUser as any, { status: OperatorStatusEnum.available });
    expect(result.status).toBe('available');
  });

  it('7. audit log is created on status change', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({ userId: 'op-uuid-1', status: 'offline', activeChats: 0 });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockRedis.atomicStatusUpdate.mockResolvedValue(undefined);
    mockPrisma.auditLog.create.mockResolvedValue({});

    await operatorSvc.updateStatus(operatorUser as any, { status: OperatorStatusEnum.available });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'operator.status.changed' }),
    }));
  });

  // ── 3. ZSET update ────────────────────────────────────────────────────────────
  it('8. atomicStatusUpdate called with score=activeChats', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({ userId: 'op-uuid-1', status: 'offline', activeChats: 3 });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockRedis.atomicStatusUpdate.mockResolvedValue(undefined);

    await operatorSvc.updateStatus(operatorUser as any, { status: OperatorStatusEnum.available });
    expect(mockRedis.atomicStatusUpdate).toHaveBeenCalledWith('op-uuid-1', 'available', 3);
  });

  // ── 4. Transfer targets ───────────────────────────────────────────────────────
  it('9. transfer targets filters by language', async () => {
    mockPrisma.operatorState.findMany.mockResolvedValue([]);
    await operatorSvc.getTransferTargets(operatorUser as any, { language: 'uz' });
    expect(mockPrisma.operatorState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          languages: { has: 'uz' },
        }),
      }),
    );
  });

  it('10. transfer targets excludes requester by default', async () => {
    mockPrisma.operatorState.findMany.mockResolvedValue([]);
    await operatorSvc.getTransferTargets(operatorUser as any, {});
    const call = mockPrisma.operatorState.findMany.mock.calls[0][0];
    expect(call.where.userId.not).toBe('op-uuid-1');
  });

  it('11. customer cannot get transfer targets', async () => {
    await expect(
      operatorSvc.getTransferTargets(customerUser as any, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('12. supervisors appear in transfer-targets even when busy', async () => {
    mockPrisma.operatorState.findMany.mockResolvedValue([]);
    await operatorSvc.getTransferTargets(operatorUser as any, {});
    // 2 calls: operators (status=available) + supervisors (status IN available,busy)
    const supervisorCall = mockPrisma.operatorState.findMany.mock.calls[1][0];
    expect(supervisorCall.where.status.$in ?? supervisorCall.where.status.in).toEqual(
      expect.arrayContaining(['available', 'busy']),
    );
  });

  // ── 5. Disconnect handling ────────────────────────────────────────────────────
  it('13. handleOperatorDisconnect sets offline when was available', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({
      userId: 'op-uuid-1', status: 'available', activeChats: 0,
    });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockRedis.removeFromAvailable.mockResolvedValue(undefined);

    await operatorSvc.handleOperatorDisconnect('op-uuid-1');
    expect(mockPrisma.operatorState.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'offline' }),
    }));
    expect(mockRedis.removeFromAvailable).toHaveBeenCalledWith('op-uuid-1');
  });

  it('14. disconnect with active chats publishes warning event', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({
      userId: 'op-uuid-1', status: 'available', activeChats: 3,
    });
    mockPrisma.operatorState.update.mockResolvedValue({});
    mockRedis.removeFromAvailable.mockResolvedValue(undefined);

    await operatorSvc.handleOperatorDisconnect('op-uuid-1');
    expect(mockRabbitmq.publish).toHaveBeenCalledWith(
      'operator.disconnected.active_chats',
      expect.objectContaining({ active_chats: 3 }),
    );
  });

  it('15. disconnect does nothing if operator was on_call (not available/away)', async () => {
    mockPrisma.operatorState.findUnique.mockResolvedValue({
      userId: 'op-uuid-1', status: 'on_call', activeChats: 1,
    });

    await operatorSvc.handleOperatorDisconnect('op-uuid-1');
    expect(mockPrisma.operatorState.update).not.toHaveBeenCalled();
    expect(mockRedis.removeFromAvailable).not.toHaveBeenCalled();
  });

  // ── 6. Bulk presence ──────────────────────────────────────────────────────────
  it('16. bulk presence returns correct online flags', async () => {
    mockRedis.getPresenceBulk.mockResolvedValue(['2024-01-01T00:00:00.000Z', null, '2024-01-02T00:00:00.000Z']);
    const result = await presenceSvc.getBulkPresence(['u1', 'u2', 'u3']);
    expect(result.users[0].online).toBe(true);
    expect(result.users[1].online).toBe(false);
    expect(result.users[2].online).toBe(true);
  });

  // ── 7. Webhook signature ──────────────────────────────────────────────────────
  it('17. HMAC signature verification logic (unit test)', () => {
    const secret = 'test-secret-key';
    const body = Buffer.from(JSON.stringify({ user: 'user-1', client: 'cli-1' }));
    const validSig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const invalidSig = 'deadbeefdeadbeef';

    // Simulate the verifySignature function
    const verify = (sig: string) => {
      const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
      try {
        return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
      } catch { return false; }
    };

    expect(verify(validSig)).toBe(true);
    expect(verify(invalidSig)).toBe(false);
  });

  // ── 8. Online operators ───────────────────────────────────────────────────────
  it('18. getOnlineOperators forbidden for customers', async () => {
    await expect(
      operatorSvc.getOnlineOperators(customerUser as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('19. getOnlineOperators returns empty when ZSET empty', async () => {
    mockRedis.getAvailableOperators.mockResolvedValue([]);
    const result = await operatorSvc.getOnlineOperators(operatorUser as any);
    expect(result.operators).toEqual([]);
  });

  it('20. getOnlineOperators maps DB state to operators', async () => {
    mockRedis.getAvailableOperators.mockResolvedValue([{ id: 'op-uuid-1', score: 0 }]);
    mockPrisma.operatorState.findMany.mockResolvedValue([{
      userId: 'op-uuid-1',
      status: 'available',
      activeChats: 0,
      maxConcurrentChats: 5,
      languages: ['uz'],
      skills: [],
      isSupervisor: false,
      user: { id: 'op-uuid-1', fullName: 'Test Operator' },
    }]);

    const result = await operatorSvc.getOnlineOperators(operatorUser as any);
    expect(result.operators).toHaveLength(1);
    expect(result.operators[0].full_name).toBe('Test Operator');
    expect(result.operators[0].status).toBe('available');
  });
});
