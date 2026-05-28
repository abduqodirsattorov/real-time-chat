import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { matchFaq } from './engines/faq.engine';
import { callAi, ContextMessage } from './engines/ai.engine';
import { CreateBotConfigDto, UpdateBotConfigDto, TestBotDto } from './bot.dto';

const ADMIN_ROLES = new Set(['admin', 'supervisor']);
const SYSTEM_BOT_PHONE = '+bot:system:0000';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private systemBotUserId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
    private readonly centrifugo: CentrifugoService,
  ) {}

  async onModuleInit() {
    await this.ensureSystemBotUser();
    await this.rabbitmq.subscribe(async (data) => {
      await this.handleMessageCreated(data);
    });
    this.logger.log({ event: 'bot_gateway_ready', botUserId: this.systemBotUserId });
  }

  // ── RabbitMQ consumer ────────────────────────────────────────────────────────

  async handleMessageCreated(event: any) {
    const roomId = event.room_id ?? event.roomId;
    const content = event.content ?? '';
    const senderId = event.sender_id ?? event.senderId;

    // Skip messages sent by the system bot itself to avoid loops
    if (senderId === this.systemBotUserId) return;

    try {
      const room = await this.prisma.room.findUnique({ where: { id: roomId } });
      if (!room || (room.status as string) !== 'bot_handling') return;

      const botConfig = await this.getActiveBotConfig();
      if (!botConfig) {
        this.logger.warn({ event: 'no_active_bot_config', roomId });
        return;
      }

      // Check handoff keywords
      const keywords: string[] = botConfig.handoffKeywords?.length
        ? botConfig.handoffKeywords
        : ['operator', 'оператор', 'odam', 'человек'];

      if (keywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()))) {
        await this.escalateToOperator(roomId, 'keyword_triggered', botConfig);
        return;
      }

      // Run through bot engine
      const cfg = botConfig.config as any;
      const result = await this.runEngine(content, botConfig.type, cfg, roomId);

      if (!result) {
        if (botConfig.fallbackToHuman) {
          await this.escalateToOperator(roomId, 'no_answer', botConfig);
        } else {
          const fallbackMsg = 'Uzr, bu savolga javob bera olmayapman. Qayta urinib ko\'ring.';
          await this.sendBotMessage(roomId, fallbackMsg, botConfig.id);
        }
        return;
      }

      await this.sendBotMessage(roomId, result.answer, botConfig.id);
    } catch (err) {
      this.logger.error({ event: 'message_handler_error', roomId, err: String(err) });
    }
  }

  // ── Engine dispatch ─────────────────────────────────────────────────────────

  private async runEngine(
    text: string,
    type: string,
    cfg: any,
    roomId: string,
  ): Promise<{ answer: string; confidence: number } | null> {
    let result: { answer: string; confidence: number } | null = null;

    if (type === 'faq' || type === 'hybrid') {
      const pairs = cfg?.faq?.pairs ?? cfg?.pairs ?? [];
      const threshold = cfg?.faq?.confidence_threshold ?? cfg?.confidence_threshold ?? 0.6;
      result = matchFaq(text, pairs, threshold);
    }

    if (!result && (type === 'ai' || type === 'hybrid')) {
      const aiCfg = cfg?.ai ?? cfg;
      const context = await this.getRecentContext(roomId);
      result = await callAi(text, aiCfg, context);
    }

    return result;
  }

  // ── Bot message insert ──────────────────────────────────────────────────────

  private async sendBotMessage(roomId: string, content: string, botConfigId: string) {
    if (!this.systemBotUserId) await this.ensureSystemBotUser();
    if (!this.systemBotUserId) return;

    const now = new Date();

    const msg = await this.prisma.message.create({
      data: {
        roomId,
        senderId: this.systemBotUserId,
        type: 'text' as any,
        content,
        metadata: { isBot: true, botConfigId },
        createdAt: now,
      },
    });

    await this.prisma.room.update({
      where: { id: roomId },
      data: { lastMessageAt: now },
    });

    await this.centrifugo.publish(`chat:room#${roomId}`, {
      event: 'message.created',
      message: {
        id: msg.id,
        roomId,
        senderId: this.systemBotUserId,
        type: 'text',
        content,
        metadata: { isBot: true },
        createdAt: now.toISOString(),
      },
    });

    this.logger.log({ event: 'bot_message_sent', roomId, msgId: msg.id });
  }

  // ── Escalation ──────────────────────────────────────────────────────────────

  async escalateToOperator(roomId: string, reason: string, botConfig?: any) {
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'open' as any, botHandled: true, escalatedAt: new Date() },
    });

    const systemMsg = 'Siz operator bilan ulandirilmoqdasiz. Iltimos, kuting.';
    if (this.systemBotUserId) {
      await this.sendBotMessage(roomId, systemMsg, botConfig?.id ?? 'system');
    }

    await this.rabbitmq.publish('bot.handoff', {
      room_id: roomId,
      reason,
      ts: Date.now(),
    });

    this.logger.log({ event: 'bot_handoff', roomId, reason });
  }

  // ── REST: CRUD bot configs ───────────────────────────────────────────────────

  async createBotConfig(user: JwtUser, dto: CreateBotConfigDto) {
    this.assertAdmin(user);
    return this.prisma.botConfig.create({
      data: {
        name: dto.name,
        type: dto.type,
        enabled: dto.enabled ?? false,
        config: dto.config ?? {},
        fallbackToHuman: dto.fallbackToHuman ?? true,
        handoffKeywords: dto.handoffKeywords ?? [],
      },
    });
  }

  async getBotConfigs(user: JwtUser) {
    this.assertAdmin(user);
    return this.prisma.botConfig.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getBotConfig(user: JwtUser, id: string) {
    this.assertAdmin(user);
    const config = await this.prisma.botConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('Bot konfiguratsiyasi topilmadi');
    return config;
  }

  async updateBotConfig(user: JwtUser, id: string, dto: UpdateBotConfigDto) {
    this.assertAdmin(user);
    await this.getBotConfig(user, id);
    return this.prisma.botConfig.update({ where: { id }, data: dto });
  }

  async deleteBotConfig(user: JwtUser, id: string) {
    this.assertAdmin(user);
    await this.getBotConfig(user, id);
    await this.prisma.botConfig.update({ where: { id }, data: { enabled: false } });
    return { id, disabled: true };
  }

  // ── REST: Test bot ──────────────────────────────────────────────────────────

  async testBot(user: JwtUser, dto: TestBotDto) {
    this.assertAdmin(user);

    const config = dto.botConfigId
      ? await this.prisma.botConfig.findUnique({ where: { id: dto.botConfigId } })
      : await this.getActiveBotConfig();

    if (!config) throw new NotFoundException('Aktiv bot konfiguratsiyasi topilmadi');

    const cfg = config.config as any;
    const result = await this.runEngine(dto.message, config.type, cfg, 'test-room');

    return {
      configId: config.id,
      configName: config.name,
      type: config.type,
      input: dto.message,
      result: result ?? null,
      wouldEscalate: !result && config.fallbackToHuman,
    };
  }

  // ── REST: Manual handoff ────────────────────────────────────────────────────

  async manualHandoff(user: JwtUser, roomId: string) {
    this.assertAdmin(user);
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Xona topilmadi');

    await this.escalateToOperator(roomId, 'manual_handoff');
    return { roomId, status: 'open', escalated: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private assertAdmin(user: JwtUser) {
    if (!ADMIN_ROLES.has(user.role)) throw new ForbiddenException('Faqat admin/supervisor');
  }

  private async getActiveBotConfig() {
    return this.prisma.botConfig.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getRecentContext(roomId: string): Promise<ContextMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    return messages.reverse().map(m => ({
      role: m.senderId === this.systemBotUserId ? 'assistant' : 'user',
      content: m.content ?? '',
    }));
  }

  private async ensureSystemBotUser() {
    try {
      const existing = await this.prisma.user.findFirst({
        where: { phone: SYSTEM_BOT_PHONE },
      });
      if (existing) {
        this.systemBotUserId = existing.id;
        return;
      }
      const created = await this.prisma.user.create({
        data: { phone: SYSTEM_BOT_PHONE, role: 'bot' as any, fullName: 'System Bot' },
      });
      this.systemBotUserId = created.id;
      this.logger.log({ event: 'system_bot_user_created', id: created.id });
    } catch (err) {
      this.logger.warn({ event: 'system_bot_user_warn', err: String(err) });
    }
  }
}
