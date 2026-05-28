import { Global, Module } from '@nestjs/common';
import { LiveKitEgressService } from './livekit-egress.service';

@Global()
@Module({ providers: [LiveKitEgressService], exports: [LiveKitEgressService] })
export class LiveKitEgressModule {}
