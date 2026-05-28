import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './prisma/prisma.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { MinioModule } from './minio/minio.module';
import { LiveKitEgressModule } from './livekit/livekit-egress.module';
import { AuthModule } from './common/auth.module';
import { RecordingsModule } from './recordings/recordings.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    PrismaModule,
    RabbitMQModule,
    MinioModule,
    LiveKitEgressModule,
    AuthModule,
    RecordingsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
