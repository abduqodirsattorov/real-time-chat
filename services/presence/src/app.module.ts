import { Module, MiddlewareConsumer, NestModule, Controller, Get } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { PresenceModule } from './presence/presence.module';
import { OperatorModule } from './operator/operator.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Controller()
class HealthController {
  @Get('healthz') health() { return { status: 'ok' }; }
  @Get('readyz')  ready()  { return { status: 'ready' }; }
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
    RabbitMQModule,
    PresenceModule,
    OperatorModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
