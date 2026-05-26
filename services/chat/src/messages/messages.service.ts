import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MeilisearchService } from '../meilisearch/meilisearch.service';
import { RoomsService } from '../rooms/rooms.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { v4 as uuidv4 } from 'uuid';

const EDIT_WINDOW_MS = 5 * 60 * 1000;
const IDEM_TTL = 86400;
const SYSTEM_SENDER = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly centrifugo: CentrifugoService,
    private readonly rabbitmq: RabbitMQService,
    private readonly meili: MeilisearchService,
    private readonly rooms: RoomsService,
  ) {}

  // ── List messages ────────────────────────────────────────────────────────────

  async list(user: JwtUser, roomId: string, dto: ListMessagesDto) {
    await this.rooms.assertMember(user.sub, roomId);

    const limit = dto.limit ?? 50;
    const where: any = { roomId, deletedAt: null };

    if (dto.cursor) {
      try {
        where.createdAt = { lt: new Date(Buffer.from(dto.cursor, 'base64').toString('utf8')) };
      } catch {}
    }
    if (dto.before) where.createdAt = { lt: new Date(dto.before) };
    if (dto.after) where.createdAt = { gt: new Date(dto.after) };

    const msgs = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = msgs.length > limit;
    const items = hasMore ? msgs.slice(0, limit) : msgs;
    const nextCursor = hasMore
      ? Buffer.from(items[items.length - 1].createdAt.toISOString()).toString('base64')
      : null;

    return { items, nextCursor, hasMore };
  }

  // ── Create message ────────────────────────────────────────────────────────────

  async create(user: JwtUser, roomId: string, dto: CreateMessageDto) {
    await this.rooms.assertMember(user.sub, roomId);

    // Idempotency check
    if (dto.clientMessageId) {
      const idemKey = `msg:idem:${dto.clientMessageId}`;
      const existingId = await this.redis.get(idemKey);
      if (existingId) {
        const cached = await this.prisma.message.findFirst({ where: { id: existingId } });
        if (cached) return cached;
      }
    }

    const newId = uuidv4();
    const msg = await this.prisma.message.create({
      data: {
        id: newId,
        roomId,
        senderId: user.sub,
        type: dto.type as any,
        content: dto.content,
        replyToId: dto.replyToId ?? null,
        metadata: {},
      },
    });

    await this.prisma.room.update({
      where: { id: roomId },
      data: { lastMessageAt: msg.createdAt },
    });

    if (dto.clientMessageId) {
      await this.redis.set(`msg:idem:${dto.clientMessageId}`, msg.id, IDEM_TTL);
    }

    await this.centrifugo.publishToRoom(roomId, 'message.created', {
      message: msg, senderId: user.sub,
    });

    await this.rabbitmq.publish('message.created', {
      room_id: roomId, message_id: msg.id, sender_id: user.sub,
      type: dto.type, content_preview: (dto.content ?? '').slice(0, 100),
      locale: user.locale, timestamp: Date.now(),
    });

    await this.meili.indexMessage({
      id: msg.id, roomId, senderId: user.sub,
      type: dto.type, content: dto.content ?? '',
      locale: user.locale, createdAt: msg.createdAt.getTime(),
    });

    this.logger.log({ event: 'message_created', msgId: msg.id, roomId, userId: user.sub });
    return msg;
  }

  // ── Update message ────────────────────────────────────────────────────────────

  async update(user: JwtUser, messageId: string, dto: UpdateMessageDto) {
    const msg = await this.prisma.message.findFirst({ where: { id: messageId } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Xabar topilmadi');
    if (msg.senderId !== user.sub) throw new ForbiddenException('Faqat o\'z xabarini o\'zgartirish mumkin');
    if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ForbiddenException('Xabarni o\'zgartirish muddati o\'tdi (5 daqiqa)');
    }
    if (msg.type !== 'text') throw new BadRequestException('Faqat matn xabarlarini tahrirlash mumkin');

    const history = (msg.metadata as any)?.history ?? [];
    history.push({ content: msg.content, editedAt: new Date().toISOString() });

    const updated = await this.prisma.message.updateMany({
      where: { id: messageId },
      data: {
        content: dto.content,
        editedAt: new Date(),
        metadata: { ...(msg.metadata as any), history },
      },
    });

    const result = await this.prisma.message.findFirst({ where: { id: messageId } });
    await this.centrifugo.publishToRoom(msg.roomId, 'message.updated', { message: result });
    return result;
  }

  // ── Delete message (soft) ─────────────────────────────────────────────────────

  async delete(user: JwtUser, messageId: string) {
    const msg = await this.prisma.message.findFirst({ where: { id: messageId } });
    if (!msg || msg.deletedAt) throw new NotFoundException('Xabar topilmadi');

    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (msg.senderId !== user.sub && !isOperator) throw new ForbiddenException();

    await this.prisma.message.updateMany({
      where: { id: messageId },
      data: { deletedAt: new Date(), type: 'text', content: '' },
    });

    await this.centrifugo.publishToRoom(msg.roomId, 'message.deleted', { messageId });
    await this.meili.deleteMessage(messageId);

    return { deleted: true };
  }

  // ── Mark as read ──────────────────────────────────────────────────────────────

  async markRead(user: JwtUser, messageId: string) {
    const msg = await this.prisma.message.findFirst({ where: { id: messageId } });
    if (!msg || msg.deletedAt) throw new NotFoundException();
    await this.rooms.assertMember(user.sub, msg.roomId);

    await this.prisma.messageReceipt.upsert({
      where: { messageId_userId: { messageId, userId: user.sub } },
      create: { messageId, userId: user.sub, readAt: new Date() },
      update: { readAt: new Date() },
    });

    await this.centrifugo.publishToRoom(msg.roomId, 'message.read', {
      messageId, userId: user.sub, readAt: new Date().toISOString(),
    });

    return { read: true };
  }

  // ── Typing indicator ──────────────────────────────────────────────────────────

  async typing(user: JwtUser, roomId: string, typing: boolean) {
    await this.rooms.assertMember(user.sub, roomId);
    await this.centrifugo.publishToRoom(roomId, 'typing', {
      userId: user.sub, typing, ts: Date.now(),
    });
    return { ok: true };
  }

  // ── System message ────────────────────────────────────────────────────────────

  async sendSystemMessage(roomId: string, templateKey: string, vars: Record<string, string> = {}) {
    const tmpl = await this.prisma.systemMessageTemplate.findUnique({
      where: { key: templateKey },
    });
    if (!tmpl) {
      this.logger.warn({ event: 'system_template_missing', key: templateKey });
      return null;
    }

    const interpolate = (text: string) =>
      text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

    const content = JSON.stringify({
      uz: interpolate(tmpl.templateUz),
      ru: interpolate(tmpl.templateRu),
    });

    const newId = uuidv4();
    const msg = await this.prisma.message.create({
      data: {
        id: newId,
        roomId,
        senderId: SYSTEM_SENDER,
        type: 'system',
        content,
        metadata: {},
      },
    });

    await this.prisma.room.update({
      where: { id: roomId },
      data: { lastMessageAt: msg.createdAt },
    });

    await this.centrifugo.publishToRoom(roomId, 'message.created', { message: msg });
    return msg;
  }
}
