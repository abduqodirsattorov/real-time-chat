import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

const EXCHANGE = 'nova.events';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.ChannelModel;
  private channel: amqp.Channel;
  private readonly logger = new Logger(RabbitMQService.name);

  async onModuleInit() {
    try {
      const url = process.env.RABBITMQ_URL ?? 'amqp://nova:nova_dev_pass@rabbitmq:5672';
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      this.logger.log('RabbitMQ connected');
    } catch (e) {
      this.logger.warn({ event: 'rabbitmq_init_warn', err: e?.message });
    }
  }

  async onModuleDestroy() {
    try { await this.channel?.close(); } catch {}
    try { await (this.connection as any)?.close?.(); } catch {}
  }

  async publish(routingKey: string, payload: Record<string, any>): Promise<void> {
    try {
      this.channel.publish(
        EXCHANGE, routingKey,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true, contentType: 'application/json', timestamp: Math.floor(Date.now() / 1000) },
      );
    } catch (e) {
      this.logger.warn({ event: 'rabbitmq_publish_fail', routingKey, err: e?.message });
    }
  }
}
