import { Controller, Get, Header } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  healthz() {
    return { status: 'ok', service: 'recording-service', ts: new Date().toISOString() };
  }

  @Get('readyz')
  async readyz() {
    const checks: Record<string, string> = {};
    try { await this.prisma.$queryRaw`SELECT 1`; checks.postgres = 'ok'; }
    catch { checks.postgres = 'fail'; }
    const allOk = Object.values(checks).every((v) => v === 'ok');
    return { status: allOk ? 'ready' : 'degraded', checks };
  }

  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    return [
      `process_cpu_user_seconds_total{service="recording-service"} ${(cpu.user / 1e6).toFixed(4)}`,
      `process_resident_memory_bytes{service="recording-service"} ${mem.rss}`,
      `process_uptime_seconds{service="recording-service"} ${uptime.toFixed(1)}`,
      `service_up{service="recording-service"} 1`,
    ].join('\n') + '\n';
  }
}
