import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { CentrifugoModule } from './centrifugo/centrifugo.module';
import { LiveKitModule } from './livekit/livekit.module';
import { AuthModule } from './common/auth.module';
import { CallsModule } from './calls/calls.module';
import { QueueModule } from './queue/queue.module';
import { HealthController } from './health/health.controller';
import { LiveKitController } from './livekit/livekit.controller';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    CentrifugoModule,
    LiveKitModule,
    AuthModule,
    CallsModule,
    QueueModule,
  ],
  controllers: [HealthController, LiveKitController],
})
export class AppModule {}
