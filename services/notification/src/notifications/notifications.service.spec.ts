import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { I18nService } from './i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { PushService } from '../push/push.service';

const mockPrisma = {
  device: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockRedis = { isOnline: jest.fn() };
const mockRabbitmq = { setHandler: jest.fn(), publish: jest.fn() };
const mockPush = { sendFcm: jest.fn(), sendVoip: jest.fn() };

// Minimal i18n
const mockI18n = {
  t: jest.fn((locale, key, vars = {}) => {
    const map: Record<string, string> = {
      'notification.new_message.title': 'Yangi xabar',
      'notification.new_message.body': `${vars['sender_name']}: ${vars['message_preview']}`,
      'notification.incoming_call.title': 'Kiruvchi qo\'ng\'iroq',
      'notification.incoming_call.body': `${vars['caller_name']} qo\'ng\'iroq qilmoqda`,
      'notification.missed_call.title': 'Javobsiz qo\'ng\'iroq',
      'notification.missed_call.body': `${vars['caller_name']} sizga qo\'ng\'iroq qildi`,
    };
    return map[key] ?? key;
  }),
};

const androidDevice = { id: 'd1', platform: 'android', pushToken: 'tok-android', voipToken: null, locale: 'uz', user: { locale: 'uz' } };
const iosDevice    = { id: 'd2', platform: 'ios',     pushToken: 'tok-ios',     voipToken: 'voip-tok', locale: 'uz', user: { locale: 'uz' } };

describe('NotificationsService', () => {
  let svc: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: RabbitMQService, useValue: mockRabbitmq },
        { provide: PushService, useValue: mockPush },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compile();

    svc = module.get<NotificationsService>(NotificationsService);
  });

  // ── 1. RabbitMQ handler registration ─────────────────────────────────────
  it('1. registers handler with RabbitMQ on init', () => {
    svc.onModuleInit();
    expect(mockRabbitmq.setHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  // ── 2. message.created: skips online user ─────────────────────────────────
  it('2. message.created skips online users', async () => {
    mockRedis.isOnline.mockResolvedValue(true);
    await svc.onMessageCreated({ receiver_ids: ['u1'], sender_name: 'Ali', content_preview: 'Salom', room_id: 'r1', message_id: 'm1' });
    expect(mockPrisma.device.findMany).not.toHaveBeenCalled();
    expect(mockPush.sendFcm).not.toHaveBeenCalled();
  });

  // ── 3. message.created: sends FCM for offline user ────────────────────────
  it('3. message.created sends FCM to offline user device', async () => {
    mockRedis.isOnline.mockResolvedValue(false);
    mockPrisma.device.findMany.mockResolvedValue([androidDevice]);
    mockPush.sendFcm.mockResolvedValue(true);

    await svc.onMessageCreated({ receiver_ids: ['u1'], sender_name: 'Operator', content_preview: 'Yordam kerakmi?', room_id: 'r1', message_id: 'm1' });

    expect(mockPush.sendFcm).toHaveBeenCalledWith(expect.objectContaining({
      token: 'tok-android',
      title: 'Yangi xabar',
      data: expect.objectContaining({ type: 'chat_message' }),
    }));
  });

  // ── 4. message.created: supports single receiver_id ──────────────────────
  it('4. message.created works with single receiver_id field', async () => {
    mockRedis.isOnline.mockResolvedValue(false);
    mockPrisma.device.findMany.mockResolvedValue([androidDevice]);
    mockPush.sendFcm.mockResolvedValue(true);

    await svc.onMessageCreated({ receiver_id: 'u1', sender_name: 'Ali', content_preview: 'Hi' });
    expect(mockPrisma.device.findMany).toHaveBeenCalled();
  });

  // ── 5. message.created: no devices = no push ──────────────────────────────
  it('5. message.created does not crash when user has no devices', async () => {
    mockRedis.isOnline.mockResolvedValue(false);
    mockPrisma.device.findMany.mockResolvedValue([]);
    await expect(svc.onMessageCreated({ receiver_ids: ['u1'] })).resolves.not.toThrow();
    expect(mockPush.sendFcm).not.toHaveBeenCalled();
  });

  // ── 6. call.initiated: sends VoIP for iOS ─────────────────────────────────
  it('6. call.initiated sends VoIP push to iOS device', async () => {
    mockPrisma.device.findMany.mockResolvedValue([iosDevice]);
    mockPush.sendVoip.mockResolvedValue(true);
    mockPush.sendFcm.mockResolvedValue(true);

    await svc.onCallInitiated({ call_id: 'c1', callee_id: 'u2', caller_name: 'Operator', livekit_url: 'ws://lk', livekit_token: 'tok' });

    expect(mockPush.sendVoip).toHaveBeenCalledWith(expect.objectContaining({
      voipToken: 'voip-tok',
      callId: 'c1',
      callerName: 'Operator',
    }));
  });

  // ── 7. call.initiated: Android gets FCM high-priority ────────────────────
  it('7. call.initiated sends high-priority FCM to Android', async () => {
    mockPrisma.device.findMany.mockResolvedValue([androidDevice]);
    mockPush.sendFcm.mockResolvedValue(true);

    await svc.onCallInitiated({ call_id: 'c1', callee_id: 'u2', caller_name: 'Operator' });

    expect(mockPush.sendFcm).toHaveBeenCalledWith(expect.objectContaining({
      highPriority: true,
      data: expect.objectContaining({ type: 'incoming_call' }),
    }));
    expect(mockPush.sendVoip).not.toHaveBeenCalled();
  });

  // ── 8. call.initiated: missing callee_id does nothing ────────────────────
  it('8. call.initiated without callee_id does nothing', async () => {
    await svc.onCallInitiated({ call_id: 'c1' });
    expect(mockPrisma.device.findMany).not.toHaveBeenCalled();
  });

  // ── 9. call.ended: only sends for no_answer status ────────────────────────
  it('9. call.ended sends missed-call push only for no_answer', async () => {
    mockPrisma.device.findMany.mockResolvedValue([androidDevice]);
    mockPush.sendFcm.mockResolvedValue(true);

    await svc.onCallEnded({ call_id: 'c1', callee_id: 'u2', status: 'no_answer', caller_name: 'Ali' });

    expect(mockPush.sendFcm).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'missed_call' }),
    }));
  });

  // ── 10. call.ended: completed status does not push ────────────────────────
  it('10. call.ended with completed status does not push', async () => {
    await svc.onCallEnded({ call_id: 'c1', callee_id: 'u2', status: 'completed' });
    expect(mockPrisma.device.findMany).not.toHaveBeenCalled();
    expect(mockPush.sendFcm).not.toHaveBeenCalled();
  });

  // ── 11. handleEvent: routes to correct handler ───────────────────────────
  it('11. handleEvent routes message.created correctly', async () => {
    mockRedis.isOnline.mockResolvedValue(true);
    await svc.handleEvent('message.created', { receiver_ids: [] });
    // no crash, no push (empty receivers)
    expect(mockPush.sendFcm).not.toHaveBeenCalled();
  });

  // ── 12. handleEvent: unknown event ignored safely ─────────────────────────
  it('12. handleEvent ignores unknown routing keys', async () => {
    await expect(svc.handleEvent('some.unknown.event', {})).resolves.not.toThrow();
    expect(mockPush.sendFcm).not.toHaveBeenCalled();
  });
});
