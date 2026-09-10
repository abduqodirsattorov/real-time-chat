import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './prisma/prisma.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { CentrifugoModule } from './centrifugo/centrifugo.module';
import { AuthModule } from './common/auth.module';
import { BotModule } from './bot/bot.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'token',
            'secret',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    PrismaModule,
    RabbitMQModule,
    CentrifugoModule,
    AuthModule,
    BotModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
