import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';

const EXCHANGE = 'nova.events';
const BOT_QUEUE = 'bot.inbox';

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
      await this.channel.assertQueue(BOT_QUEUE, { durable: true });
      await this.channel.bindQueue(BOT_QUEUE, EXCHANGE, 'message.created');
      this.logger.log({ event: 'rabbitmq_connected', queue: BOT_QUEUE });
    } catch (err) {
      this.logger.error({ event: 'rabbitmq_connect_error', err: String(err) });
    }
  }

  async onModuleDestroy() {
    try { await this.channel?.close(); } catch {}
    try { await this.connection?.close(); } catch {}
  }

  async subscribe(handler: (data: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      this.logger.warn({ event: 'rabbitmq_subscribe_not_ready' });
      return;
    }
    await this.channel.consume(BOT_QUEUE, async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data);
        this.channel?.ack(msg);
      } catch (err) {
        this.logger.error({ event: 'rabbitmq_handler_error', err: String(err) });
        this.channel?.nack(msg, false, false);
      }
    });
  }

  async publish(routingKey: string, payload: object): Promise<void> {
    if (!this.channel) { this.logger.warn({ event: 'rabbitmq_not_ready', routingKey }); return; }
    const buf = Buffer.from(JSON.stringify({ ...payload, _routing_key: routingKey }));
    this.channel.publish(EXCHANGE, routingKey, buf, { persistent: true });
  }
}
