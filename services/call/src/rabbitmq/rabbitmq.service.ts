import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';

const EXCHANGE = 'nova.events';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;

  async onModuleInit() {
    try {
      this.connection = await amqplib.connect(process.env.RABBITMQ_URL ?? 'amqp://localhost:5672');
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      this.logger.log({ event: 'rabbitmq_connected' });
    } catch (err) {
      this.logger.error({ event: 'rabbitmq_connect_error', err });
    }
  }

  async onModuleDestroy() {
    try { await this.channel?.close(); } catch {}
    try { await this.connection?.close(); } catch {}
  }

  async publish(routingKey: string, payload: object): Promise<void> {
    if (!this.channel) { this.logger.warn({ event: 'rabbitmq_not_ready', routingKey }); return; }
    const buf = Buffer.from(JSON.stringify({ ...payload, _routing_key: routingKey }));
    this.channel.publish(EXCHANGE, routingKey, buf, { persistent: true });
  }
}
