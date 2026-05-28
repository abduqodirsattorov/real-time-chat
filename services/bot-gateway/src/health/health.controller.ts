import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return { status: 'ok', service: 'bot-gateway', ts: new Date().toISOString() };
  }
}
