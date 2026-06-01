import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.LOG_PRETTY === 'true'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        serializers: {
          req(req) {
            return {
              method: req.method,
              url: req.url,
              correlationId: req.headers['x-correlation-id'],
            };
          },
        },
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
