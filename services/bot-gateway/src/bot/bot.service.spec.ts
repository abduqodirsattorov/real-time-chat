import { Test } from '@nestjs/testing';
import { BotService } from './bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { matchFaq } from './engines/faq.engine';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

// ── FAQ Engine unit tests ─────────────────────────────────────────────────────

describe('matchFaq', () => {
  const pairs = [
    { keywords: ['narx', 'qiymat', 'price'], answer: 'Narx $10/oy' },
    { keywords: ['ish', 'vaqt', 'hours'], answer: 'Ish vaqti: 9-18' },
    { keywords: ['qaytarish', 'refund'], answer: '30 kun ichida qaytarish mumkin' },
  ];

  it('T1: matches keyword at low threshold', () => {
    const result = matchFaq('narx qancha', pairs, 0.3);
    expect(result).not.toBeNull();
    expect(result!.answer).toBe('Narx $10/oy');
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it('T2: returns null when no keyword matches', () => {
    const result = matchFaq('salom assalomu alaykum', pairs);
    expect(result).toBeNull();
  });

  it('T3: picks highest confidence when multiple pairs match partially', () => {
    const result = matchFaq('narx va ish vaqti', pairs);
    expect(result).not.toBeNull();
  });

  it('T4: threshold filters low-confidence matches', () => {
    // Only 1/3 keywords match → score = 0.33, below threshold 0.6
    const result = matchFaq('narx yaxshi', pairs, 0.6);
    // 'narx' hits 1 out of 3 keywords = 0.33 < 0.6
    expect(result).toBeNull();
  });

  it('T5: low threshold allows partial matches', () => {
    const result = matchFaq('narx yaxshi', pairs, 0.3);
    expect(result).not.toBeNull();
  });
});

// ── BotService unit tests ────────────────────────────────────────────────────

const mockPrisma = {
  botConfig: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  room: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockRabbitmq = { subscribe: jest.fn(), publish: jest.fn() };
const mockCentrifugo = { publish: jest.fn() };

const adminUser = { sub: 'admin-1', role: 'admin', phone: '+1', locale: 'uz' };
const supUser   = { sub: 'sup-1',   role: 'supervisor', phone: '+2', locale: 'uz' };
const custUser  = { sub: 'cust-1',  role: 'customer', phone: '+3', locale: 'uz' };

const faqConfig = {
  id: 'cfg-1', name: 'FAQ Bot', type: 'faq', enabled: true,
  fallbackToHuman: true,
  handoffKeywords: ['operator', 'оператор'],
  config: {
    pairs: [
      { keywords: ['narx', 'price'], answer: 'Narx $10/oy' },
      { keywords: ['vaqt', 'hours'], answer: 'Ish vaqti 9-18' },
    ],
    confidence_threshold: 0.4,
  },
};

describe('BotService', () => {
  let service: BotService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'bot-user-1', phone: '+bot:system:0000' });
    mockRabbitmq.subscribe.mockImplementation(() => Promise.resolve());

    const module = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RabbitMQService, useValue: mockRabbitmq },
        { provide: CentrifugoService, useValue: mockCentrifugo },
      ],
    }).compile();

    service = module.get(BotService);
    await service.onModuleInit();
  });

  it('T6: onModuleInit registers subscribe handler', () => {
    expect(mockRabbitmq.subscribe).toHaveBeenCalled();
  });

  it('T7: handleMessageCreated skips when room not bot_handling', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', status: 'open' });
    await service.handleMessageCreated({ room_id: 'room-1', content: 'salom', sender_id: 'cust-1' });
    expect(mockPrisma.botConfig.findFirst).not.toHaveBeenCalled();
  });

  it('T8: handleMessageCreated detects handoff keyword and escalates', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', status: 'bot_handling' });
    mockPrisma.botConfig.findFirst.mockResolvedValue(faqConfig);
    mockPrisma.room.update.mockResolvedValue({});
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', roomId: 'room-1' });
    mockPrisma.message.findMany.mockResolvedValue([]);

    await service.handleMessageCreated({ room_id: 'room-1', content: 'operator kerak', sender_id: 'cust-1' });

    expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'open' }),
    }));
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('bot.handoff', expect.objectContaining({ room_id: 'room-1' }));
  });

  it('T9: handleMessageCreated sends FAQ answer when match found', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', status: 'bot_handling' });
    mockPrisma.botConfig.findFirst.mockResolvedValue(faqConfig);
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-2', roomId: 'room-1' });
    mockPrisma.room.update.mockResolvedValue({});
    mockPrisma.message.findMany.mockResolvedValue([]);

    await service.handleMessageCreated({ room_id: 'room-1', content: 'narx qancha', sender_id: 'cust-1' });

    expect(mockPrisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: 'Narx $10/oy' }),
    }));
    expect(mockCentrifugo.publish).toHaveBeenCalledWith(
      'chat:room#room-1',
      expect.objectContaining({ event: 'message.created' }),
    );
  });

  it('T10: handleMessageCreated escalates when FAQ no match and fallbackToHuman=true', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', status: 'bot_handling' });
    mockPrisma.botConfig.findFirst.mockResolvedValue(faqConfig);
    mockPrisma.room.update.mockResolvedValue({});
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-3', roomId: 'room-1' });
    mockPrisma.message.findMany.mockResolvedValue([]);

    await service.handleMessageCreated({ room_id: 'room-1', content: 'blah blah unknown', sender_id: 'cust-1' });

    expect(mockPrisma.room.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'open', botHandled: true }),
    }));
  });

  it('T11: createBotConfig requires admin role', async () => {
    await expect(service.createBotConfig(custUser, { name: 'test', type: 'faq' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('T12: createBotConfig creates for admin', async () => {
    mockPrisma.botConfig.create.mockResolvedValue({ id: 'cfg-new', name: 'Test', type: 'faq' });
    const result = await service.createBotConfig(adminUser, { name: 'Test', type: 'faq' });
    expect(result.id).toBe('cfg-new');
  });

  it('T13: getBotConfig throws NotFound for unknown id', async () => {
    mockPrisma.botConfig.findUnique.mockResolvedValue(null);
    await expect(service.getBotConfig(adminUser, 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('T14: testBot supervisor can test FAQ engine', async () => {
    mockPrisma.botConfig.findFirst.mockResolvedValue(faqConfig);
    const result = await service.testBot(supUser, { message: 'narx qancha' });
    expect(result.result).not.toBeNull();
    expect(result.result!.answer).toBe('Narx $10/oy');
    expect(result.wouldEscalate).toBe(false);
  });

  it('T15: testBot returns wouldEscalate=true when no match', async () => {
    mockPrisma.botConfig.findFirst.mockResolvedValue(faqConfig);
    const result = await service.testBot(adminUser, { message: 'boshqa narsa' });
    expect(result.result).toBeNull();
    expect(result.wouldEscalate).toBe(true);
  });

  it('T16: manualHandoff updates room status to open', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-2', status: 'bot_handling' });
    mockPrisma.room.update.mockResolvedValue({ status: 'open' });
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-5', roomId: 'room-2' });
    mockPrisma.message.findMany.mockResolvedValue([]);

    const result = await service.manualHandoff(adminUser, 'room-2');
    expect(result.escalated).toBe(true);
    expect(mockRabbitmq.publish).toHaveBeenCalledWith('bot.handoff', expect.any(Object));
  });

  it('T17: handleMessageCreated skips own messages (loop guard)', async () => {
    mockPrisma.room.findUnique.mockResolvedValue({ id: 'room-1', status: 'bot_handling' });
    // sender_id === systemBotUserId → should return early
    await service.handleMessageCreated({ room_id: 'room-1', content: 'test', sender_id: 'bot-user-1' });
    expect(mockPrisma.botConfig.findFirst).not.toHaveBeenCalled();
  });
});
