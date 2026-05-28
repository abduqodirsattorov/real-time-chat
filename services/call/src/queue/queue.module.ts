import { Module } from '@nestjs/common';
import { QueueProcessor } from './queue.processor';

@Module({ providers: [QueueProcessor] })
export class QueueModule {}
