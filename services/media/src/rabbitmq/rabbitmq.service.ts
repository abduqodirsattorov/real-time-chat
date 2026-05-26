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
    try {
      await this.channel?.close();
      await (this.connection as any)?.close?.();
    } catch {}
  }

  async publish(routingKey: string, payload: Record<string, any>): Promise<void> {
    try {
      const content = Buffer.from(JSON.stringify(payload));
      this.channel.publish(EXCHANGE, routingKey, content, {
        persistent: true,
        contentType: 'application/json',
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (e) {
      this.logger.warn({ event: 'rabbitmq_publish_fail', routingKey, err: e?.message });
    }
  }

  async consume(queue: string, routingKey: string, handler: (msg: any) => Promise<void>): Promise<void> {
    try {
      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.bindQueue(queue, EXCHANGE, routingKey);
      await this.channel.consume(queue, async (msg) => {
        if (!msg) return;
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(payload);
          this.channel.ack(msg);
        } catch (e) {
          this.logger.warn({ event: 'rabbitmq_consume_fail', queue, err: e?.message });
          this.channel.nack(msg, false, false);
        }
      });
    } catch (e) {
      this.logger.warn({ event: 'rabbitmq_consume_setup_fail', queue, err: e?.message });
    }
  }
}
