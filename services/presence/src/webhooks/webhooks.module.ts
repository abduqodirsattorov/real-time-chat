import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PresenceModule } from '../presence/presence.module';
import { OperatorModule } from '../operator/operator.module';

@Module({
  imports: [PresenceModule, OperatorModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
