import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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

  @Cron('*/15 * * * * *') // every 15 seconds
  async processQueue() {
    const pending = await this.prisma.callQueue.findMany({
      where: { assignedAt: null },
      orderBy: [{ priority: 'desc' }, { enqueuedAt: 'asc' }],
      take: 10,
    });

    if (pending.length === 0) return;

    for (const item of pending) {
      const call = await this.prisma.call.findUnique({ where: { id: item.callId } });
      if (!call || call.status !== 'queued') {
        await this.prisma.callQueue.delete({ where: { id: item.id } });
        continue;
      }

      const locale = item.requiredLanguage ?? 'uz';
      const candidates = await this.prisma.operatorState.findMany({
        where: {
          status: 'available' as any,
          languages: { has: locale as any },
          ...(item.requiredSkills.length > 0 ? { skills: { hasSome: item.requiredSkills } } : {}),
        },
        orderBy: { activeChats: 'asc' },
        take: 5,
      });

      for (const op of candidates) {
        if (op.activeChats >= op.maxConcurrentChats) continue;
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

        await this.centrifugo.publishToUser(op.userId, 'call.incoming', {
          callId: call.id, callerId: call.callerId, livekitRoom: call.livekitRoom, ts: new Date().toISOString(),
        });

        this.logger.log({ event: 'queue_dispatched', callId: call.id, operatorId: op.userId });
        break;
      }
    }
  }
}
