import { Controller, Get } from '@nestjs/common';
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
}
