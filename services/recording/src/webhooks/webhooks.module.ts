import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { RecordingsModule } from '../recordings/recordings.module';

@Module({
  imports: [RecordingsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
