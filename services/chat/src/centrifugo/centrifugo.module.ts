import { Global, Module } from '@nestjs/common';
import { CentrifugoService } from './centrifugo.service';
import { CentrifugoWebhookController } from './centrifugo.controller';

@Global()
@Module({
  controllers: [CentrifugoWebhookController],
  providers: [CentrifugoService],
  exports: [CentrifugoService],
})
export class CentrifugoModule {}
