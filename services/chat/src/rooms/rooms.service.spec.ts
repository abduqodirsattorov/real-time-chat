import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

const mockRoom = {
  id: 'room-uuid-1', type: 'support', status: 'active',
  title: null, metadata: {}, lastMessageAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(), members: [],
};

const operatorUser = { sub: 'op-uuid', role: 'operator', locale: 'uz', jti: 'jti1' };
const customerUser = { sub: 'cust-uuid', role: 'customer', locale: 'uz', jti: 'jti2' };

const prisma = {
  room: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  roomMember: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};
const centrifugo = { publishToRoom: jest.fn() };
const rabbitmq = { publish: jest.fn() };

describe('RoomsService', () => {
  let service: RoomsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CentrifugoService, useValue: centrifugo },
        { provide: RabbitMQService, useValue: rabbitmq },
      ],
    }).compile();
    service = module.get<RoomsService>(RoomsService);
  });

  // ── List ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('operator — barcha roomlarni ko\'radi', async () => {
      prisma.room.findMany.mockResolvedValue([mockRoom]);
      const result = await service.list(operatorUser, {});
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('cursor bilan pagination ishlaydi', async () => {
      const rooms = Array.from({ length: 51 }, (_, i) => ({ ...mockRoom, id: `room-${i}`, lastMessageAt: new Date() }));
      prisma.room.findMany.mockResolvedValue(rooms);
      const result = await service.list(operatorUser, { limit: 50 });
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
      expect(result.items).toHaveLength(50);
    });
  });

  // ── Create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('support room yaratadi (pending holat)', async () => {
      prisma.room.create.mockResolvedValue({ ...mockRoom, status: 'pending', members: [] });
      const result = await service.create(customerUser, { type: 'support' });
      expect(result.status).toBe('pending');
      expect(prisma.room.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'support', status: 'pending' }) }),
      );
    });

    it('direct room yaratadi (active holat)', async () => {
      prisma.room.create.mockResolvedValue({ ...mockRoom, type: 'direct', status: 'active', members: [] });
      const result = await service.create(customerUser, { type: 'direct', memberIds: ['other-uuid'] });
      expect(result.status).toBe('active');
    });

    it('creator har doim a\'zo bo\'ladi', async () => {
      prisma.room.create.mockResolvedValue({ ...mockRoom, members: [] });
      await service.create(customerUser, { type: 'support' });
      const callArgs = prisma.room.create.mock.calls[0][0];
      const memberIds = callArgs.data.members.create.map((m: any) => m.userId);
      expect(memberIds).toContain(customerUser.sub);
    });
  });

  // ── Get One ───────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('operator istalgan roomni ko\'radi', async () => {
      prisma.room.findUnique.mockResolvedValue({ ...mockRoom, members: [] });
      const result = await service.getOne(operatorUser, 'room-uuid-1');
      expect(result.id).toBe('room-uuid-1');
    });

    it('topilmagan room NotFoundException', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.getOne(customerUser, 'unknown')).rejects.toThrow(NotFoundException);
    });

    it('a\'zo bo\'lmagan customer ForbiddenException', async () => {
      prisma.room.findUnique.mockResolvedValue({ ...mockRoom, members: [] });
      await expect(service.getOne(customerUser, 'room-uuid-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('operator room yangilay oladi', async () => {
      prisma.room.findUnique.mockResolvedValue(mockRoom);
      prisma.room.update.mockResolvedValue({ ...mockRoom, title: 'Yangi nom' });
      centrifugo.publishToRoom.mockResolvedValue(undefined);
      const result = await service.update(operatorUser, 'room-uuid-1', { title: 'Yangi nom' });
      expect(result.title).toBe('Yangi nom');
    });

    it('customer room yangilay olmaydi', async () => {
      await expect(service.update(customerUser, 'room-uuid-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Close ─────────────────────────────────────────────────────────────────────

  describe('close', () => {
    it('operator roomni yopadi', async () => {
      prisma.room.findUnique.mockResolvedValue(mockRoom);
      prisma.room.update.mockResolvedValue({ ...mockRoom, status: 'closed' });
      centrifugo.publishToRoom.mockResolvedValue(undefined);
      rabbitmq.publish.mockResolvedValue(undefined);
      const result = await service.close(operatorUser, 'room-uuid-1');
      expect(result.status).toBe('closed');
    });

    it('allaqachon yopilgan room ConflictException', async () => {
      prisma.room.findUnique.mockResolvedValue({ ...mockRoom, status: 'closed' });
      await expect(service.close(operatorUser, 'room-uuid-1')).rejects.toThrow(ConflictException);
    });
  });
});
