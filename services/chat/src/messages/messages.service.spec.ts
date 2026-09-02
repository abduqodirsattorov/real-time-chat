import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MeilisearchService } from '../meilisearch/meilisearch.service';
import { RoomsService } from '../rooms/rooms.service';

const SENDER = { sub: 'user-1', role: 'customer', locale: 'uz', jti: 'j1' };
const OPERATOR = { sub: 'op-1', role: 'operator', locale: 'uz', jti: 'j2' };
const OTHER = { sub: 'user-2', role: 'customer', locale: 'uz', jti: 'j3' };
const ROOM_ID = 'room-1';
const MSG_ID = 'msg-1';

function makeMsg(overrides: Partial<any> = {}) {
  return {
    id: MSG_ID, roomId: ROOM_ID, senderId: SENDER.sub,
    type: 'text', content: 'Salom!', clientMessageId: null,
    replyToId: null, editedAt: null, deletedAt: null,
    metadata: {}, createdAt: new Date(), attachments: [], receipts: [],
    ...overrides,
  };
}

const prisma = {
  message: {
    findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    create: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
  },
  messageReceipt: { upsert: jest.fn() },
  room: { update: jest.fn() },
  systemMessageTemplate: { findUnique: jest.fn() },
};
const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const centrifugo = { publishToRoom: jest.fn() };
const rabbitmq = { publish: jest.fn() };
const meili = { indexMessage: jest.fn(), deleteMessage: jest.fn() };
const rooms = { assertMember: jest.fn() };

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    rooms.assertMember.mockResolvedValue({ id: ROOM_ID });
    centrifugo.publishToRoom.mockResolvedValue(undefined);
    rabbitmq.publish.mockResolvedValue(undefined);
    meili.indexMessage.mockResolvedValue(undefined);
    meili.deleteMessage.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: CentrifugoService, useValue: centrifugo },
        { provide: RabbitMQService, useValue: rabbitmq },
        { provide: MeilisearchService, useValue: meili },
        { provide: RoomsService, useValue: rooms },
      ],
    }).compile();
    service = module.get<MessagesService>(MessagesService);
  });

  // ── Create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('xabar yaratadi va eventlar yuboradi', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue('OK');
      prisma.message.create.mockResolvedValue(makeMsg());
      prisma.room.update.mockResolvedValue({});

      const result = await service.create(SENDER, ROOM_ID, {
        type: 'text', content: 'Salom!', clientMessageId: 'c-1',
      });

      expect(result.id).toBe(MSG_ID);
      expect(centrifugo.publishToRoom).toHaveBeenCalledWith(ROOM_ID, 'message.created', expect.any(Object));
      expect(rabbitmq.publish).toHaveBeenCalledWith('message.created', expect.any(Object));
      expect(meili.indexMessage).toHaveBeenCalled();
    });

    it('idempotency — bir xil clientMessageId qayta xabar yaratmaydi', async () => {
      redis.get.mockResolvedValue(MSG_ID);
      prisma.message.findFirst.mockResolvedValue(makeMsg());

      const result = await service.create(SENDER, ROOM_ID, {
        type: 'text', content: 'Salom!', clientMessageId: 'c-1',
      });

      expect(result.id).toBe(MSG_ID);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('idempotency Redis key saqlanadi', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue('OK');
      prisma.message.create.mockResolvedValue(makeMsg());
      prisma.room.update.mockResolvedValue({});

      await service.create(SENDER, ROOM_ID, { type: 'text', content: 'x', clientMessageId: 'uniq-1' });

      expect(redis.set).toHaveBeenCalledWith('msg:idem:uniq-1', MSG_ID, 86400);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('sender xabarni yangilay oladi (5 daqiqa ichida)', async () => {
      const fresh = makeMsg({ createdAt: new Date(Date.now() - 60_000) });
      const updated = { ...fresh, content: 'Yangi matn', editedAt: new Date() };
      prisma.message.findFirst
        .mockResolvedValueOnce(fresh)
        .mockResolvedValueOnce(updated);
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(SENDER, MSG_ID, { content: 'Yangi matn' });
      expect(result.content).toBe('Yangi matn');
    });

    it('boshqa user xabarni o\'zgartira olmaydi', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMsg());
      await expect(service.update(OTHER, MSG_ID, { content: 'x' })).rejects.toThrow(ForbiddenException);
    });

    it('5 daqiqadan keyin o\'zgartirish ForbiddenException', async () => {
      const old = makeMsg({ createdAt: new Date(Date.now() - 6 * 60_000) });
      prisma.message.findFirst.mockResolvedValue(old);
      await expect(service.update(SENDER, MSG_ID, { content: 'x' })).rejects.toThrow(ForbiddenException);
    });

    it('matn bo\'lmagan xabarni tahrirlash BadRequestException', async () => {
      const img = makeMsg({ type: 'image', createdAt: new Date() });
      prisma.message.findFirst.mockResolvedValue(img);
      await expect(service.update(SENDER, MSG_ID, { content: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('tahrirlash tarixi metadata.history da saqlanadi', async () => {
      const fresh = makeMsg({ createdAt: new Date(Date.now() - 30_000), metadata: {} });
      prisma.message.findFirst
        .mockResolvedValueOnce(fresh)
        .mockResolvedValueOnce({ ...fresh, content: 'Yangi' });
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      await service.update(SENDER, MSG_ID, { content: 'Yangi' });

      const updateArgs = prisma.message.updateMany.mock.calls[0][0];
      expect(updateArgs.data.metadata.history).toHaveLength(1);
      expect(updateArgs.data.metadata.history[0].content).toBe('Salom!');
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('sender o\'z xabarini o\'chira oladi', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMsg());
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.delete(SENDER, MSG_ID);
      expect(result.deleted).toBe(true);
      expect(meili.deleteMessage).toHaveBeenCalledWith(MSG_ID);
    });

    it('operator ixtiyoriy xabarni o\'chira oladi', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMsg({ senderId: 'someone-else' }));
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.delete(OPERATOR, MSG_ID);
      expect(result.deleted).toBe(true);
    });

    it('boshqa customer o\'chirishi ForbiddenException', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMsg());
      await expect(service.delete(OTHER, MSG_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── System message i18n ────────────────────────────────────────────────────────

  describe('sendSystemMessage', () => {
    it('i18n templateni interpolatsiya qiladi', async () => {
      prisma.systemMessageTemplate.findUnique.mockResolvedValue({
        key: 'operator.joined',
        templateUz: 'Operator {name} qo\'shildi',
        templateRu: 'Оператор {name} присоединился',
      });
      prisma.message.create.mockResolvedValue(makeMsg({ type: 'system' }));
      prisma.room.update.mockResolvedValue({});
      centrifugo.publishToRoom.mockResolvedValue(undefined);

      await service.sendSystemMessage(ROOM_ID, 'operator.joined', { name: 'Ali' });

      const createArgs = prisma.message.create.mock.calls[0][0];
      const content = JSON.parse(createArgs.data.content);
      expect(content.uz).toBe('Operator Ali qo\'shildi');
      expect(content.ru).toBe('Оператор Ali присоединился');
    });

    it('template topilmasa — null qaytadi', async () => {
      prisma.systemMessageTemplate.findUnique.mockResolvedValue(null);
      const result = await service.sendSystemMessage(ROOM_ID, 'unknown.key', {});
      expect(result).toBeNull();
    });

    it('placeholder ko\'p bo\'lsa hammasi almashtiriladi', async () => {
      prisma.systemMessageTemplate.findUnique.mockResolvedValue({
        key: 'test',
        templateUz: '{a} va {b}',
        templateRu: '{a} и {b}',
      });
      prisma.message.create.mockResolvedValue(makeMsg({ type: 'system' }));
      prisma.room.update.mockResolvedValue({});
      centrifugo.publishToRoom.mockResolvedValue(undefined);

      await service.sendSystemMessage(ROOM_ID, 'test', { a: 'X', b: 'Y' });

      const content = JSON.parse(prisma.message.create.mock.calls[0][0].data.content);
      expect(content.uz).toBe('X va Y');
    });
  });

  // ── Mark read ─────────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('receipt upsert qiladi va event yuboradi', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMsg());
      prisma.messageReceipt.upsert.mockResolvedValue({});

      const result = await service.markRead(SENDER, MSG_ID);
      expect(result.read).toBe(true);
      expect(centrifugo.publishToRoom).toHaveBeenCalledWith(ROOM_ID, 'message.read', expect.any(Object));
    });
  });
});
