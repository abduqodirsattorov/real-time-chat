import {
  Controller, Post, Body, Headers, RawBodyRequest,
  UnauthorizedException, Logger, Req,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PresenceService } from '../presence/presence.service';
import { OperatorService } from '../operator/operator.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('webhooks/centrifugo')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly secret = process.env.CENTRIFUGO_WEBHOOK_SECRET
    ?? process.env.CENTRIFUGO_API_KEY
    ?? '';

  constructor(
    private readonly presence: PresenceService,
    private readonly operator: OperatorService,
    private readonly rabbitmq: RabbitMQService,
    private readonly prisma: PrismaService,
  ) {}

  private verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!this.secret) return true; // skip if not configured
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch { return false; }
  }

  @Post('connect')
  async onConnect(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-centrifugo-sign') signature: string,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    if (signature && !this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Centrifugo signature');
    }

    const userId: string = body.user ?? body.data?.user;
    if (!userId) {
      this.logger.warn({ event: 'webhook_connect_no_user', body });
      return {};
    }

    await this.presence.touchPresence(userId);

    await this.rabbitmq.publish('user.connected', {
      user_id: userId,
      client: body.client,
      transport: body.transport,
      ts: Date.now(),
    });

    this.logger.log({ event: 'user_connected', userId, client: body.client });
    return {};
  }

  @Post('disconnect')
  async onDisconnect(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-centrifugo-sign') signature: string,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    if (signature && !this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Centrifugo signature');
    }

    const userId: string = body.user ?? body.data?.user;
    if (!userId) return {};

    // Do NOT refresh presence TTL on disconnect — let it expire naturally.
    // The key acts as "active connection" indicator; refreshing it here would
    // make isOnline() return true for 30 min after disconnect, breaking ACD.

    // Check if this user is an operator
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user && ['operator', 'supervisor'].includes(user.role)) {
      await this.operator.handleOperatorDisconnect(userId);
    }

    await this.rabbitmq.publish('user.disconnected', {
      user_id: userId,
      client: body.client,
      ts: Date.now(),
    });

    this.logger.log({ event: 'user_disconnected', userId });
    return {};
  }
}
