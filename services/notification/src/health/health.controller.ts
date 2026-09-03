import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  healthz() { return { status: 'ok', service: 'notification-service' }; }

  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    return [
      `process_cpu_user_seconds_total{service="notification-service"} ${(cpu.user / 1e6).toFixed(4)}`,
      `process_resident_memory_bytes{service="notification-service"} ${mem.rss}`,
      `process_uptime_seconds{service="notification-service"} ${uptime.toFixed(1)}`,
      `service_up{service="notification-service"} 1`,
    ].join('\n') + '\n';
  }
}
