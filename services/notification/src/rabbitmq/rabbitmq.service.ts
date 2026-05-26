import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqplib from 'amqplib';

const EXCHANGE = 'nova.events';
const QUEUE    = 'notification.push';
const ROUTING_KEYS = [
  'message.created',
  'call.initiated',
  'call.ended',
  'user.connected',
];

export type MessageHandler = (routingKey: string, payload: any) => Promise<void>;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqplib.ChannelModel;
  private channel: amqplib.Channel;
  private handler: MessageHandler | null = null;

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL ?? 'amqp://nova:nova_dev_pass@rabbitmq:5672';
    try {
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await this.channel.assertQueue(QUEUE, { durable: true });
      for (const key of ROUTING_KEYS) {
        await this.channel.bindQueue(QUEUE, EXCHANGE, key);
      }
      this.channel.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const routingKey = msg.fields.routingKey;
          const payload = JSON.parse(msg.content.toString());
          if (this.handler) await this.handler(routingKey, payload);
          this.channel.ack(msg);
        } catch (err) {
          this.logger.error({ event: 'consumer_error', err });
          this.channel.nack(msg, false, false);
        }
      });
      this.logger.log('RabbitMQ consumer started');
    } catch (err) {
      this.logger.error({ event: 'rabbitmq_init_failed', err });
    }
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {}
  }

  setHandler(handler: MessageHandler) {
    this.handler = handler;
  }
}
