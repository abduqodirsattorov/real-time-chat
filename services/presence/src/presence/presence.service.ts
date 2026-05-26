import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUserPresence(userId: string, requestorRole: string) {
    const lastSeen = await this.redis.getPresence(userId);
    const online = lastSeen !== null;

    const result: any = {
      user_id: userId,
      online,
      last_seen: lastSeen ?? null,
    };

    // Operator status visible to operators/supervisors/admin only
    if (['operator', 'supervisor', 'admin'].includes(requestorRole)) {
      const opState = await this.prisma.operatorState.findUnique({
        where: { userId },
        select: { status: true, activeChats: true, onCall: true },
      });
      if (opState) {
        result.status = opState.status;
        result.active_chats = opState.activeChats;
        result.on_call = opState.onCall;
      }
    }

    return result;
  }

  async getBulkPresence(ids: string[]) {
    const lastSeenValues = await this.redis.getPresenceBulk(ids);

    const users = ids.map((id, i) => {
      const lastSeen = lastSeenValues[i];
      return {
        id,
        online: lastSeen !== null,
        last_seen: lastSeen ?? null,
      };
    });

    return { users };
  }

  async touchPresence(userId: string): Promise<void> {
    await this.redis.setPresence(userId);
  }
}
