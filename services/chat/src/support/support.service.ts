import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MessagesService } from '../messages/messages.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { SupportRequestDto } from './support.dto';

const CLAIM_TTL = 5; // seconds — atomic lock

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly centrifugo: CentrifugoService,
    private readonly rabbitmq: RabbitMQService,
    private readonly messages: MessagesService,
  ) {}

  async requestSupport(user: JwtUser, dto: SupportRequestDto) {
    const productId = dto.productId ?? null;

    // 1. Mavjud ochiq support room bormi?
    const existingRoom = await this.prisma.room.findFirst({
      where: {
        type: 'support',
        status: { in: ['open', 'pending'] },
        members: { some: { userId: user.sub, leftAt: null } },
        ...(productId ? { productId } : {}),
      },
    });

    if (existingRoom) {
      throw new ConflictException({
        message: 'Sizning aktiv support so\'rovingiz mavjud',
        roomId: existingRoom.id,
      });
    }

    // 2. Yangi room (pending) — product bilan bog'lash
    const room = await this.prisma.room.create({
      data: {
        type: 'support',
        status: 'pending',
        title: dto.subject ?? null,
        customerId: user.sub,
        ...(productId ? { productId } : {}),
        members: {
          create: { userId: user.sub },
        },
      },
    });

    this.logger.log({ event: 'support_request', roomId: room.id, userId: user.sub, productId });

    // 3. ACD — faqat shu productda ishlayotgan operatorlar
    const operator = await this.findAvailableOperator(user.locale, dto.requiredSkills ?? [], productId);

    if (!operator) {
      await this.rabbitmq.publish('support.pending', {
        room_id: room.id, user_id: user.sub,
        locale: user.locale, timestamp: Date.now(),
      });
      await this.messages.sendSystemMessage(room.id, 'support.waiting', {});
      return { room, status: 'pending', message: 'Operator qidirilyapti...' };
    }

    await this.assignOperator(room.id, operator.userId, user.sub, user.locale);
    return { room, status: 'active', operatorId: operator.userId };
  }

  private async findAvailableOperator(
    locale: string,
    requiredSkills: string[],
    productId: string | null,
  ): Promise<{ userId: string; activeChats: number } | null> {
    const candidates = await this.prisma.operatorState.findMany({
      where: {
        status: 'available',
        languages: { has: locale as any },
        ...(productId ? { currentProductId: productId } : {}),
        ...(requiredSkills.length > 0 ? { skills: { hasSome: requiredSkills } } : {}),
      },
      orderBy: { activeChats: 'asc' },
      take: 10,
    });

    for (const candidate of candidates) {
      if (candidate.activeChats >= candidate.maxConcurrentChats) continue;

      const claimKey = `acd:claim:${candidate.userId}`;
      const claimed = await this.redis.setnx(claimKey, 'locked', CLAIM_TTL);
      if (claimed) {
        return { userId: candidate.userId, activeChats: candidate.activeChats };
      }
    }

    return null;
  }

  private async assignOperator(
    roomId: string,
    operatorId: string,
    customerId: string,
    locale: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'open', operatorId },
      }),
      this.prisma.roomMember.upsert({
        where: { roomId_userId: { roomId, userId: operatorId } },
        create: { roomId, userId: operatorId },
        update: { leftAt: null },
      }),
      this.prisma.operatorState.update({
        where: { userId: operatorId },
        data: { activeChats: { increment: 1 } },
      }),
    ]);

    const opUser = await this.prisma.user.findUnique({
      where: { id: operatorId },
      select: { fullName: true },
    });

    await this.messages.sendSystemMessage(roomId, 'operator.joined', {
      name: opUser?.fullName ?? 'Operator',
    });

    await this.centrifugo.publishToRoom(roomId, 'operator.joined', {
      operatorId, roomId, ts: new Date().toISOString(),
    });

    await this.rabbitmq.publish('operator.assigned', {
      room_id: roomId, operator_id: operatorId,
      customer_id: customerId, locale, timestamp: Date.now(),
    });

    await this.redis.del(`acd:claim:${operatorId}`);

    this.logger.log({ event: 'operator_assigned', roomId, operatorId, customerId });
  }
}
