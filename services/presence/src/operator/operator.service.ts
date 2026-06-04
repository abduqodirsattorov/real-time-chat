import {
  Injectable, ForbiddenException, NotFoundException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { UpdateStatusDto, OperatorStatusEnum } from './dto/update-status.dto';
import { TransferTargetsDto } from './dto/transfer-targets.dto';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

@Injectable()
export class OperatorService {
  private readonly logger = new Logger(OperatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  // ── POST /operator/status ─────────────────────────────────────────────────────

  async updateStatus(user: JwtUser, dto: UpdateStatusDto) {
    if (!OPERATOR_ROLES.has(user.role)) {
      throw new ForbiddenException('Faqat operator/supervisor status o\'zgartira oladi');
    }

    const existing = await this.prisma.operatorState.findUnique({ where: { userId: user.sub } });
    const oldStatus = existing?.status ?? 'offline';
    const newStatus = dto.status as string;

    const opState = await this.prisma.operatorState.upsert({
      where: { userId: user.sub },
      create: {
        userId: user.sub,
        status: dto.status as any,
        activeChats: 0,
        maxConcurrentChats: 5,
        onCall: false,
        skills: [],
        languages: ['uz' as any],
        lastStatusAt: new Date(),
      },
      update: {
        status: dto.status as any,
        lastStatusAt: new Date(),
      },
    });

    // Atomic Redis ZSET update
    await this.redis.atomicStatusUpdate(user.sub, newStatus, opState.activeChats);

    // Mark presence:user key so call-service isOnline() works
    if (newStatus !== 'offline') {
      await this.redis.setPresence(user.sub);
    }

    // RabbitMQ event
    await this.rabbitmq.publish('operator.status.changed', {
      user_id: user.sub,
      old_status: oldStatus,
      new_status: newStatus,
      ts: Date.now(),
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'operator.status.changed',
        targetType: 'operator_state',
        targetId: user.sub,
        payload: { old_status: oldStatus, new_status: newStatus },
      },
    });

    this.logger.log({ event: 'status_changed', userId: user.sub, from: oldStatus, to: newStatus });

    return {
      userId: user.sub,
      status: newStatus,
      previous: oldStatus,
      ts: new Date().toISOString(),
    };
  }

  // ── GET /operator/online ─────────────────────────────────────────────────────

  async getOnlineOperators(user: JwtUser) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    const available = await this.redis.getAvailableOperators();

    if (!available.length) return { operators: [] };

    const userIds = available.map(o => o.id);
    const states = await this.prisma.operatorState.findMany({
      where: { userId: { in: userIds } },
      include: { user: { select: { id: true, fullName: true } } },
    });

    const stateMap = new Map(states.map(s => [s.userId, s]));

    const operators = available
      .filter(o => stateMap.has(o.id))
      .map(o => {
        const s = stateMap.get(o.id)!;
        return {
          id: s.userId,
          full_name: s.user.fullName,
          status: s.status,
          active_chats: s.activeChats,
          max_concurrent_chats: s.maxConcurrentChats,
          languages: s.languages,
          skills: s.skills,
          is_supervisor: s.isSupervisor,
        };
      });

    return { operators };
  }

  // ── GET /operator/transfer-targets ───────────────────────────────────────────

  async getTransferTargets(user: JwtUser, dto: TransferTargetsDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    const langFilter = dto.language
      ? { languages: { has: dto.language as any } }
      : {};

    const excludeId = dto.exclude_user_id ?? user.sub;

    // Available operators (not on call, not requester)
    const operators = await this.prisma.operatorState.findMany({
      where: {
        status: 'available',
        onCall: false,
        userId: { not: excludeId },
        ...langFilter,
      },
      orderBy: { activeChats: 'asc' },
      take: 20,
      include: { user: { select: { id: true, fullName: true } } },
    });

    // Supervisors: available or busy (for escalation), any status except offline
    const supervisors = await this.prisma.operatorState.findMany({
      where: {
        isSupervisor: true,
        status: { in: ['available', 'busy'] as any },
        userId: { not: excludeId },
        ...langFilter,
      },
      orderBy: { activeChats: 'asc' },
      take: 10,
      include: { user: { select: { id: true, fullName: true } } },
    });

    const toDto = (s: any) => ({
      id: s.userId,
      full_name: s.user.fullName,
      status: s.status,
      active_chats: s.activeChats,
      max_concurrent_chats: s.maxConcurrentChats,
      languages: s.languages,
      skills: s.skills,
    });

    return {
      operators: operators.map(toDto),
      supervisors: supervisors.map(toDto),
    };
  }

  // ── PATCH /operator/product ──────────────────────────────────────────────────

  async selectProduct(user: JwtUser, productId: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    await this.prisma.operatorState.upsert({
      where: { userId: user.sub },
      create: {
        userId: user.sub,
        status: 'offline' as any,
        currentProductId: productId,
        skills: [],
        languages: ['uz' as any],
      },
      update: { currentProductId: productId },
    });

    this.logger.log({ event: 'product_selected', userId: user.sub, productId });
    return { userId: user.sub, productId };
  }

  // ── Internal: handle operator disconnect (called from webhooks) ──────────────

  async handleOperatorDisconnect(userId: string) {
    const opState = await this.prisma.operatorState.findUnique({ where: { userId } });
    if (!opState) return;

    if (opState.status === 'available' || opState.status === 'away' || opState.status === ('break' as any)) {
      const oldStatus = opState.status;

      await this.prisma.operatorState.update({
        where: { userId },
        data: { status: 'offline' as any, lastStatusAt: new Date() },
      });

      await this.redis.removeFromAvailable(userId);

      await this.rabbitmq.publish('operator.status.changed', {
        user_id: userId,
        old_status: oldStatus,
        new_status: 'offline',
        reason: 'disconnect',
        ts: Date.now(),
      });

      // Notify supervisor if operator had active chats
      if (opState.activeChats > 0) {
        await this.rabbitmq.publish('operator.disconnected.active_chats', {
          operator_id: userId,
          active_chats: opState.activeChats,
          ts: Date.now(),
        });
        this.logger.warn({
          event: 'operator_disconnected_with_chats',
          userId,
          activeChats: opState.activeChats,
        });
      }
    }
  }
}
