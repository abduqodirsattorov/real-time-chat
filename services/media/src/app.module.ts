import { Module, MiddlewareConsumer, NestModule, Controller, Get, Header } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MinioModule } from './minio/minio.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { MediaModule } from './media/media.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Controller()
class HealthController {
  @Get('healthz')
  health() { return { status: 'ok' }; }

  @Get('readyz')
  ready() { return { status: 'ready' }; }

  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    return [
      `process_cpu_user_seconds_total{service="media-service"} ${(cpu.user / 1e6).toFixed(4)}`,
      `process_resident_memory_bytes{service="media-service"} ${mem.rss}`,
      `process_uptime_seconds{service="media-service"} ${uptime.toFixed(1)}`,
      `service_up{service="media-service"} 1`,
    ].join('\n') + '\n';
  }
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.LOG_PRETTY === 'true' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    MinioModule,
    RabbitMQModule,
    MediaModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
