import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

const EXCHANGE = 'nova.events';
const MEILI_QUEUE = 'meilisearch.index';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.ChannelModel;
  private channel: amqp.Channel;
  private readonly logger = new Logger(RabbitMQService.name);
  private ready = false;

  async onModuleInit() {
    await this.connect();
  }

  private async connect(retries = 5): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const url = process.env.RABBITMQ_URL ?? 'amqp://nova:nova_dev_pass@rabbitmq:5672';
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        this.ready = true;
        this.logger.log('RabbitMQ connected');
        this.connection.on('close', () => { this.ready = false; this.logger.warn('RabbitMQ connection closed'); });
        return;
      } catch (e) {
        this.logger.warn(`RabbitMQ connect attempt ${i + 1} failed: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
    this.logger.error('RabbitMQ connection failed after retries — events will be dropped');
  }

  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.ready) return;
    try {
      this.channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
    } catch (e) {
      this.logger.warn({ event: 'rabbitmq_publish_fail', routingKey, err: e?.message });
    }
  }

  async consume(queue: string, handler: (msg: Record<string, unknown>) => Promise<void>): Promise<void> {
    if (!this.ready) return;
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, EXCHANGE, 'message.created');
    this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data);
        this.channel.ack(msg);
      } catch (e) {
        this.logger.warn({ event: 'rabbitmq_consume_error', err: e?.message });
        this.channel.nack(msg, false, false);
      }
    });
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await (this.connection as any)?.close?.();
    } catch {}
  }
}
