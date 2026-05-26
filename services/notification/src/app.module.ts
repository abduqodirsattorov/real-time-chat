import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { PushModule } from './push/push.module';
import { DevicesModule } from './devices/devices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    PushModule,
    DevicesModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
