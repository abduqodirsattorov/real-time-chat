import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { CentrifugoModule } from '../centrifugo/centrifugo.module';

@Module({
  imports: [PrismaModule, RabbitMQModule, CentrifugoModule],
  controllers: [BotController],
  providers: [BotService],
})
export class BotModule {}
