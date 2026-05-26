import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../auth/decorators/current-user.decorator';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('healthz')
  healthz() {
    return { status: 'ok', service: 'auth-service', ts: new Date().toISOString() };
  }

  @Public()
  @Get('readyz')
  async readyz() {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);

    const ready = dbOk && redisOk;
    return {
      status: ready ? 'ready' : 'not_ready',
      checks: { db: dbOk, redis: redisOk },
    };
  }
}
