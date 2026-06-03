import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';

const CLAIM_TTL = 5;

@Injectable()
export class QueueProcessor {
  private readonly logger = new Logger(QueueProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly centrifugo: CentrifugoService,
  ) {}

  @Cron('*/15 * * * * *')
  async processQueue() {
    const pending = await this.prisma.callQueue.findMany({
      where: { assignedAt: null },
      orderBy: [{ priority: 'desc' }, { enqueuedAt: 'asc' }],
      take: 10,
    });

    if (pending.length === 0) return;

    for (const item of pending) {
      const call = await this.prisma.call.findUnique({ where: { id: item.callId } });

      // Call no longer queued (canceled by customer, already assigned, etc.) — clean up
      if (!call || call.status !== 'queued') {
        await this.prisma.callQueue.delete({ where: { id: item.id } });
        continue;
      }

      const locale = item.requiredLanguage ?? 'uz';
      const productId = (call.metadata as any)?.productId ?? null;

      // MUST match findAvailableOperator criteria: onCall=false + isOnline check
      const candidates = await this.prisma.operatorState.findMany({
        where: {
          status: 'available' as any,
          onCall: false,               // ← operator must not be on another call
          languages: { has: locale as any },
          ...(productId ? { currentProductId: productId } : {}),
          ...(item.requiredSkills.length > 0 ? { skills: { hasSome: item.requiredSkills } } : {}),
        },
        orderBy: { activeChats: 'asc' },
        take: 10,
      });

      let dispatched = false;
      for (const op of candidates) {
        if (op.activeChats >= op.maxConcurrentChats) continue;

        // Skip operators without active Redis presence (stale DB status)
        const online = await this.redis.isOnline(op.userId);
        if (!online) continue;

        const claimed = await this.redis.setnx(`operator:claim:${op.userId}`, '1', CLAIM_TTL);
        if (!claimed) continue;

        await this.prisma.callQueue.update({
          where: { id: item.id },
          data: { assignedAt: new Date(), assignedTo: op.userId },
        });
        await this.prisma.call.update({
          where: { id: item.callId },
          data: { calleeId: op.userId, status: 'ringing' },
        });
        await this.prisma.operatorState.updateMany({
          where: { userId: op.userId },
          data: { onCall: true },
        });

        await this.centrifugo.publishToUser(op.userId, 'call.incoming', {
          callId: call.id, callerId: call.callerId,
          livekitRoom: call.livekitRoom, ts: new Date().toISOString(),
        });

        this.logger.log({ event: 'queue_dispatched', callId: call.id, operatorId: op.userId });
        dispatched = true;
        break;
      }

      if (!dispatched) {
        this.logger.debug({ event: 'queue_no_operator', callId: call.id });
        // Do NOT delete — caller keeps waiting until an operator becomes available
      }
    }
  }
}
