import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('healthz')
  async healthz() {
    return { status: 'ok', service: 'call-service', ts: new Date().toISOString() };
  }

  @Get('readyz')
  async readyz() {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }

    try {
      await this.redis.client.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return { status: allOk ? 'ready' : 'degraded', checks };
  }

  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    return [
      `process_cpu_user_seconds_total{service="call-service"} ${(cpu.user / 1e6).toFixed(4)}`,
      `process_resident_memory_bytes{service="call-service"} ${mem.rss}`,
      `process_uptime_seconds{service="call-service"} ${uptime.toFixed(1)}`,
      `service_up{service="call-service"} 1`,
    ].join('\n') + '\n';
  }
}
