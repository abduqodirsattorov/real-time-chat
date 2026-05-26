import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { PushService } from '../push/push.service';
import { I18nService } from './i18n.service';

type Locale = 'uz' | 'ru';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService,
    private readonly push: PushService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit() {
    this.rabbitmq.setHandler(this.handleEvent.bind(this));
  }

  async handleEvent(routingKey: string, payload: any): Promise<void> {
    this.logger.debug({ event: 'event_received', routingKey });

    switch (routingKey) {
      case 'message.created':
        await this.onMessageCreated(payload);
        break;
      case 'call.initiated':
        await this.onCallInitiated(payload);
        break;
      case 'call.ended':
        await this.onCallEnded(payload);
        break;
      case 'user.connected':
        // no push needed for connect events
        break;
      default:
        this.logger.debug({ event: 'event_ignored', routingKey });
    }
  }

  // ── message.created ───────────────────────────────────────────────────────
  // payload: { room_id, message_id, sender_id, receiver_ids, sender_name, content_preview }
  async onMessageCreated(payload: any): Promise<void> {
    const receiverIds: string[] = Array.isArray(payload.receiver_ids)
      ? payload.receiver_ids
      : payload.receiver_id ? [payload.receiver_id] : [];

    for (const receiverId of receiverIds) {
      const online = await this.redis.isOnline(receiverId);
      if (online) continue; // skip — user is connected to Centrifugo

      const devices = await this.prisma.device.findMany({
        where: { userId: receiverId },
        include: { user: { select: { locale: true } } },
      });

      for (const device of devices) {
        const locale = (device.locale ?? device.user?.locale ?? 'uz') as Locale;
        const title = this.i18n.t(locale, 'notification.new_message.title');
        const body = this.i18n.t(locale, 'notification.new_message.body', {
          sender_name: payload.sender_name ?? 'User',
          message_preview: (payload.content_preview ?? '').slice(0, 100),
        });

        await this.push.sendFcm({
          token: device.pushToken,
          title,
          body,
          data: {
            type: 'chat_message',
            room_id: payload.room_id ?? '',
            message_id: payload.message_id ?? '',
          },
        });
      }
    }
  }

  // ── call.initiated ────────────────────────────────────────────────────────
  // payload: { call_id, caller_id, callee_id, caller_name, livekit_url, livekit_token }
  async onCallInitiated(payload: any): Promise<void> {
    const calleeId: string = payload.callee_id;
    if (!calleeId) return;

    const devices = await this.prisma.device.findMany({
      where: { userId: calleeId },
      include: { user: { select: { locale: true } } },
    });

    for (const device of devices) {
      const locale = (device.locale ?? device.user?.locale ?? 'uz') as Locale;
      const title = this.i18n.t(locale, 'notification.incoming_call.title');
      const body = this.i18n.t(locale, 'notification.incoming_call.body', {
        caller_name: payload.caller_name ?? 'Operator',
      });

      // iOS VoIP push
      if (device.platform === 'ios' && device.voipToken) {
        await this.push.sendVoip({
          voipToken: device.voipToken,
          callId: payload.call_id,
          callerName: payload.caller_name ?? 'Operator',
          livekitUrl: payload.livekit_url ?? '',
          livekitToken: payload.livekit_token ?? '',
        });
      }

      // FCM high-priority (Android + iOS fallback)
      await this.push.sendFcm({
        token: device.pushToken,
        title,
        body,
        highPriority: true,
        data: {
          type: 'incoming_call',
          call_id: payload.call_id ?? '',
          caller_name: payload.caller_name ?? '',
          livekit_url: payload.livekit_url ?? '',
          livekit_token: payload.livekit_token ?? '',
        },
      });
    }
  }

  // ── call.ended (missed call) ──────────────────────────────────────────────
  // payload: { call_id, caller_id, callee_id, status, caller_name }
  async onCallEnded(payload: any): Promise<void> {
    if (payload.status !== 'no_answer') return;

    const calleeId: string = payload.callee_id;
    if (!calleeId) return;

    const devices = await this.prisma.device.findMany({
      where: { userId: calleeId },
      include: { user: { select: { locale: true } } },
    });

    for (const device of devices) {
      const locale = (device.locale ?? device.user?.locale ?? 'uz') as Locale;
      const title = this.i18n.t(locale, 'notification.missed_call.title');
      const body = this.i18n.t(locale, 'notification.missed_call.body', {
        caller_name: payload.caller_name ?? 'Operator',
      });

      await this.push.sendFcm({
        token: device.pushToken,
        title,
        body,
        data: { type: 'missed_call', call_id: payload.call_id ?? '' },
      });
    }
  }
}
