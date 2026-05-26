import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MessagesService } from '../messages/messages.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { SupportRequestDto } from './support.dto';

const ACD_ZSET = 'operator:available';
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
    // 1. Mijozning ochiq support room bor-yo'qligini tekshirish
    const existingRoom = await this.prisma.room.findFirst({
      where: {
        type: 'support',
        status: { in: ['active', 'pending'] },
        members: { some: { userId: user.sub, leftAt: null } },
      },
    });

    if (existingRoom) {
      throw new ConflictException({
        message: 'Sizning aktiv support so\'rovingiz mavjud',
        roomId: existingRoom.id,
      });
    }

    // 2. Yangi xona yaratish (pending holat)
    const room = await this.prisma.room.create({
      data: {
        type: 'support',
        status: 'pending',
        title: dto.subject ?? null,
        members: {
          create: { userId: user.sub, role: 'customer' },
        },
      },
    });

    this.logger.log({ event: 'support_request', roomId: room.id, userId: user.sub });

    // 3. ACD: bo'sh operator topish
    const operator = await this.findAvailableOperator(user.locale, dto.requiredSkills ?? []);

    if (!operator) {
      // Operator topilmadi — pending qoladi, supervisorga notification
      await this.rabbitmq.publish('support.pending', {
        room_id: room.id,
        user_id: user.sub,
        locale: user.locale,
        skills: dto.requiredSkills ?? [],
        timestamp: Date.now(),
      });

      await this.messages.sendSystemMessage(room.id, 'support.waiting', {});
      return { room, status: 'pending', message: 'Operator qidirilyapti...' };
    }

    // 4. Operator biriktirildi
    await this.assignOperator(room.id, operator.id, user.sub, user.locale);

    return { room, status: 'active', operatorId: operator.id };
  }

  private async findAvailableOperator(
    locale: string,
    requiredSkills: string[],
  ): Promise<{ id: string; activeRooms: number } | null> {
    const candidates = await this.prisma.operatorState.findMany({
      where: {
        status: 'online',
        languages: { has: locale },
        ...(requiredSkills.length > 0 ? { skills: { hasSome: requiredSkills } } : {}),
      },
      where2: undefined,
      orderBy: { activeRooms: 'asc' },
      take: 10,
    } as any);

    for (const candidate of candidates) {
      if (candidate.activeRooms >= candidate.maxRooms) continue;

      // Atomic claim — Redis SET NX (5 soniya lock)
      const claimKey = `acd:claim:${candidate.operatorId}`;
      const claimed = await this.redis.setnx(claimKey, 'locked', CLAIM_TTL);
      if (claimed) {
        return { id: candidate.operatorId, activeRooms: candidate.activeRooms };
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
    // Room'ga operator qo'shish + status=active
    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'active' },
      }),
      this.prisma.roomMember.upsert({
        where: { roomId_userId: { roomId, userId: operatorId } },
        create: { roomId, userId: operatorId, role: 'operator' },
        update: { leftAt: null },
      }),
      this.prisma.operatorState.update({
        where: { operatorId },
        data: { activeRooms: { increment: 1 } },
      }),
    ]);

    // Operator ma'lumotini olish
    const opUser = await this.prisma.user.findUnique({
      where: { id: operatorId },
      select: { fullName: true },
    });

    // Tizim xabari: "Operator qo'shildi"
    await this.messages.sendSystemMessage(roomId, 'operator.joined', {
      name: opUser?.fullName ?? 'Operator',
    });

    // Centrifugo: operator_joined event
    await this.centrifugo.publishToRoom(roomId, 'operator.joined', {
      operatorId,
      roomId,
      ts: new Date().toISOString(),
    });

    // RabbitMQ notification
    await this.rabbitmq.publish('operator.assigned', {
      room_id: roomId,
      operator_id: operatorId,
      customer_id: customerId,
      locale,
      timestamp: Date.now(),
    });

    // Redis lock ni ochish
    await this.redis.del(`acd:claim:${operatorId}`);

    this.logger.log({ event: 'operator_assigned', roomId, operatorId, customerId });
  }
}
