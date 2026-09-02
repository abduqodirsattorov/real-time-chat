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

  @Public()
  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    return [
      '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.',
      '# TYPE process_cpu_user_seconds_total counter',
      `process_cpu_user_seconds_total{service="auth-service"} ${(cpu.user / 1e6).toFixed(4)}`,
      '# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.',
      '# TYPE process_cpu_system_seconds_total counter',
      `process_cpu_system_seconds_total{service="auth-service"} ${(cpu.system / 1e6).toFixed(4)}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes{service="auth-service"} ${mem.rss}`,
      '# HELP process_heap_used_bytes Process heap used in bytes.',
      '# TYPE process_heap_used_bytes gauge',
      `process_heap_used_bytes{service="auth-service"} ${mem.heapUsed}`,
      '# HELP process_heap_total_bytes Process heap total in bytes.',
      '# TYPE process_heap_total_bytes gauge',
      `process_heap_total_bytes{service="auth-service"} ${mem.heapTotal}`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds counter',
      `process_uptime_seconds{service="auth-service"} ${uptime.toFixed(1)}`,
      '# HELP service_up Service status (1 = up)',
      '# TYPE service_up gauge',
      `service_up{service="auth-service"} 1`,
    ].join('\n') + '\n';
  }
}
