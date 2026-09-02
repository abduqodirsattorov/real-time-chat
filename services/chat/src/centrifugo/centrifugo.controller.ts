import {
  Controller, Post, Body, Headers, RawBodyRequest,
  UnauthorizedException, Logger, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('webhooks/centrifugo')
export class CentrifugoWebhookController {
  private readonly logger = new Logger(CentrifugoWebhookController.name);
  private readonly secret = process.env.CENTRIFUGO_WEBHOOK_SECRET
    ?? process.env.CENTRIFUGO_API_KEY
    ?? '';

  constructor(private readonly prisma: PrismaService) {}

  private verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!this.secret || !signature) return true;
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async onSubscribe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-centrifugo-sign') signature: string,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body || {}));
    if (signature && !this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Centrifugo signature');
    }

    const userId: string = body.user ?? body.data?.user;
    const channel: string = body.channel ?? body.data?.channel;

    if (!userId || !channel) {
      this.logger.warn({ event: 'centrifugo_subscribe_missing_params', userId, channel });
      return { error: { code: 1000, message: 'Missing user or channel' } };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.status === 'suspended') {
      this.logger.warn({ event: 'centrifugo_subscribe_denied_user', userId, channel });
      return { error: { code: 1003, message: 'User not found or suspended' } };
    }

    const isStaff = ['operator', 'supervisor', 'admin'].includes(user.role);

    // 1. Shaxsiy bildirishnoma kanali: chat:user#<userId>
    if (channel.startsWith('chat:user#')) {
      const targetUserId = channel.replace('chat:user#', '');
      if (targetUserId !== userId && user.role !== 'admin') {
        this.logger.warn({ event: 'centrifugo_subscribe_user_channel_denied', userId, targetUserId });
        return { error: { code: 1000, message: 'Cannot subscribe to other user channel' } };
      }
      return { result: {} };
    }

    // 2. Chat xonasi kanali: chat:room#<roomId>
    if (channel.startsWith('chat:room#')) {
      const roomId = channel.replace('chat:room#', '');
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: {
          members: { where: { userId, leftAt: null } },
        },
      });

      if (!room) {
        return { error: { code: 1004, message: 'Room not found' } };
      }

      // Agar xona a'zosi bo'lsa
      if (room.members.length > 0) {
        return { result: {} };
      }

      // Agar operator/supervisor/admin bo'lsa, xonaning mahsulotiga ruxsatini tekshirish
      if (isStaff) {
        if (!room.productId || user.role === 'admin') {
          return { result: {} };
        }
        const hasProductAccess = await this.prisma.operatorProduct.findFirst({
          where: { userId, productId: room.productId },
        });
        if (hasProductAccess) {
          return { result: {} };
        }
      }

      this.logger.warn({ event: 'centrifugo_subscribe_room_denied', userId, roomId });
      return { error: { code: 1000, message: 'No access to room channel' } };
    }

    // 3. Operatorlar mavjudlik kanali: presence:operators
    if (channel === 'presence:operators') {
      if (!isStaff) {
        return { error: { code: 1000, message: 'Staff only channel' } };
      }
      return { result: {} };
    }

    // 4. Qo'ng'iroq kanali: call:call#<callId>
    if (channel.startsWith('call:call#') || channel.startsWith('call:')) {
      const callId = channel.replace('call:call#', '').replace('call:', '');
      const call = await this.prisma.call.findUnique({
        where: { id: callId },
      });

      if (!call) {
        if (isStaff) return { result: {} };
        return { error: { code: 1004, message: 'Call not found' } };
      }

      const isParticipant = call.callerId === userId || call.calleeId === userId;
      if (isParticipant || isStaff) {
        return { result: {} };
      }

      return { error: { code: 1000, message: 'No access to call channel' } };
    }

    return { result: {} };
  }
}
