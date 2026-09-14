import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

const mockRoom = {
  id: 'room-uuid-1', type: 'support', status: 'open', productId: 'product-a',
  title: null, metadata: {}, lastMessageAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(), members: [],
};

const operatorUser = { sub: 'op-uuid', role: 'operator', locale: 'uz', jti: 'jti1' };
const customerUser = { sub: 'cust-uuid', role: 'customer', locale: 'uz', jti: 'jti2' };

const prisma = {
  room: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  roomMember: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  operatorProduct: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
};
const centrifugo = { publishToRoom: jest.fn() };
const rabbitmq = { publish: jest.fn() };

describe('RoomsService', () => {
  let service: RoomsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.operatorProduct.findMany.mockResolvedValue([{ productId: 'product-a' }]);
    prisma.operatorProduct.findFirst.mockResolvedValue({ productId: 'product-a' });
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
    it('lists rooms scoped to assigned products', async () => {
      prisma.room.findMany.mockResolvedValue([mockRoom]);
      const result = await service.list(operatorUser, {});
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ productId: { in: ['product-a'] } }),
      }));
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

    it('direct room yaratadi (open holat)', async () => {
      prisma.room.create.mockResolvedValue({ ...mockRoom, type: 'direct', status: 'open', members: [] });
      const result = await service.create(customerUser, { type: 'direct', memberIds: ['other-uuid'] });
      expect(result.status).toBe('open');
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
    it('operator can read a room in an assigned product', async () => {
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

  describe('tenant authorization regressions', () => {
    it('does not use an unrestricted list filter when no products are assigned', async () => {
      prisma.operatorProduct.findMany.mockResolvedValue([]);
      prisma.room.findMany.mockResolvedValue([]);
      expect((await service.list(operatorUser, {})).items).toEqual([]);
      expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ productId: { in: [] } }),
      }));
    });

    it.each(['list', 'create', 'search'] as const)('rejects a forged product header on %s', async action => {
      prisma.operatorProduct.findFirst.mockResolvedValue(null);
      const request = action === 'list' ? service.list(operatorUser, {}, 'product-b')
        : action === 'create' ? service.create(operatorUser, { type: 'support' }, 'product-b')
        : service.searchUser(operatorUser, '+998', 'product-b');
      await expect(request).rejects.toThrow(ForbiddenException);
      expect(prisma.room.create).not.toHaveBeenCalled();
      expect(prisma.room.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects unscoped operator room creation', async () => {
      await expect(service.create(operatorUser, { type: 'support' })).rejects.toThrow(ForbiddenException);
      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    it.each(['operator', 'supervisor'])('denies unrelated and unscoped rooms to %s', async role => {
      prisma.operatorProduct.findFirst.mockResolvedValue(null);
      for (const productId of ['product-b', null]) {
        prisma.room.findUnique.mockResolvedValue({ ...mockRoom, productId, members: [] });
        const user = { ...operatorUser, role };
        await expect(service.getOne(user, mockRoom.id)).rejects.toThrow(ForbiddenException);
        await expect(service.update(user, mockRoom.id, { title: 'unauthorized' })).rejects.toThrow(ForbiddenException);
        await expect(service.close(user, mockRoom.id)).rejects.toThrow(ForbiddenException);
      }
      expect(prisma.room.update).not.toHaveBeenCalled();
      expect(centrifugo.publishToRoom).not.toHaveBeenCalled();
      expect(rabbitmq.publish).not.toHaveBeenCalled();
    });

    it('preserves active membership access to a room without a product', async () => {
      prisma.room.findUnique.mockResolvedValue({ ...mockRoom, productId: null, members: [{ userId: operatorUser.sub, leftAt: null }] });
      prisma.roomMember.findUnique.mockResolvedValue({ leftAt: null });
      prisma.user.findUnique.mockResolvedValue({ role: 'operator' });
      await expect(service.getOne(operatorUser, mockRoom.id)).resolves.toHaveProperty('id', mockRoom.id);
      await expect(service.assertMember(operatorUser.sub, mockRoom.id)).resolves.toHaveProperty('id', mockRoom.id);
    });

    it('denies former members of an unscoped room', async () => {
      prisma.room.findUnique.mockResolvedValue({ ...mockRoom, productId: null, members: [{ userId: operatorUser.sub, leftAt: new Date() }] });
      prisma.roomMember.findUnique.mockResolvedValue({ leftAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({ role: 'operator' });
      await expect(service.getOne(operatorUser, mockRoom.id)).rejects.toThrow(ForbiddenException);
      await expect(service.assertMember(operatorUser.sub, mockRoom.id)).rejects.toThrow(ForbiddenException);
    });

    it('does not search users when no products are assigned', async () => {
      prisma.operatorProduct.findMany.mockResolvedValue([]);
      await expect(service.searchUser(operatorUser, '+998')).resolves.toBeNull();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('scopes phone search and room lookup to assigned products', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'customer-a', phone: '+998', fullName: 'Customer A' }]);
      prisma.room.findFirst.mockResolvedValue({ id: mockRoom.id, status: 'open' });
      await service.searchUser(operatorUser, '+998');
      const query = prisma.$queryRaw.mock.calls[0][0];
      expect(query.values).toEqual(['+998', ['product-a'], ['product-a']]);
      expect(query.sql).toContain('c.product_id = ANY(');
      expect(query.sql).toContain('r.product_id = ANY(');
      expect(prisma.room.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ customerId: 'customer-a', productId: { in: ['product-a'] } }),
      }));
    });

    it('returns no PII when there is no user in the allowed products', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.searchUser(operatorUser, '+998')).resolves.toBeNull();
      expect(prisma.room.findFirst).not.toHaveBeenCalled();
    });
  });
});
