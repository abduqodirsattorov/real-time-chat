import {
  Injectable, NotFoundException, ForbiddenException,
  ConflictException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CentrifugoService } from '../centrifugo/centrifugo.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsDto } from './dto/list-rooms.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly centrifugo: CentrifugoService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  // ── List rooms ───────────────────────────────────────────────────────────────

  async list(user: JwtUser, dto: ListRoomsDto) {
    const limit = dto.limit ?? 50;
    let cursorDate: Date | undefined;

    if (dto.cursor) {
      try {
        cursorDate = new Date(Buffer.from(dto.cursor, 'base64').toString('utf8'));
      } catch {}
    }

    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);

    const where: any = {
      ...(dto.status ? { status: dto.status as any } : {}),
      ...(dto.type ? { type: dto.type as any } : {}),
      ...(!isOperator ? {
        members: { some: { userId: user.sub, leftAt: null } },
      } : {}),
      ...(cursorDate ? { lastMessageAt: { lt: cursorDate } } : {}),
    };

    const rooms = await this.prisma.room.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1,
      include: {
        members: { select: { userId: true, joinedAt: true } },
      },
    });

    const hasMore = rooms.length > limit;
    const items = hasMore ? rooms.slice(0, limit) : rooms;
    const nextCursor = hasMore && items[items.length - 1].lastMessageAt
      ? Buffer.from(items[items.length - 1].lastMessageAt!.toISOString()).toString('base64')
      : null;

    return { items, nextCursor, hasMore };
  }

  // ── Create room ──────────────────────────────────────────────────────────────

  async create(user: JwtUser, dto: CreateRoomDto) {
    const memberIds: string[] = dto.memberIds ?? [];
    if (!memberIds.includes(user.sub)) memberIds.push(user.sub);

    const isSupport = dto.type === 'support';
    const customerId = user.role === 'customer' ? user.sub : undefined;

    const room = await this.prisma.room.create({
      data: {
        type: dto.type as any,
        title: dto.title,
        status: isSupport ? 'pending' : 'open',
        customerId,
        members: {
          create: memberIds.map(uid => ({ userId: uid })),
        },
      },
      include: { members: true },
    });

    this.logger.log({ event: 'room_created', roomId: room.id, type: dto.type, userId: user.sub });
    return room;
  }

  // ── Get room ─────────────────────────────────────────────────────────────────

  async getOne(user: JwtUser, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: { select: { userId: true, joinedAt: true, leftAt: true } },
      },
    });
    if (!room) throw new NotFoundException('Xona topilmadi');

    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    const isMember = room.members.some(m => m.userId === user.sub && !m.leftAt);
    if (!isOperator && !isMember) throw new ForbiddenException('Ushbu xonaga ruxsat yo\'q');

    return room;
  }

  // ── Update room ──────────────────────────────────────────────────────────────

  async update(user: JwtUser, roomId: string, dto: UpdateRoomDto) {
    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (!isOperator) throw new ForbiddenException('Faqat operatorlar yangilashi mumkin');

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Xona topilmadi');

    const updated = await this.prisma.room.update({
      where: { id: roomId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.status ? { status: dto.status as any } : {}),
      },
    });

    await this.centrifugo.publishToRoom(roomId, 'room.updated', { room: updated });
    return updated;
  }

  // ── Close room ───────────────────────────────────────────────────────────────

  async close(user: JwtUser, roomId: string) {
    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (!isOperator) throw new ForbiddenException('Faqat operatorlar yopishi mumkin');

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Xona topilmadi');
    if (room.status === 'closed') throw new ConflictException('Xona allaqachon yopilgan');

    const closed = await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'closed', closedAt: new Date() },
    });

    await this.centrifugo.publishToRoom(roomId, 'room.closed', {
      roomId, closedBy: user.sub, ts: new Date().toISOString(),
    });

    await this.rabbitmq.publish('room.closed', {
      room_id: roomId, closed_by: user.sub, timestamp: Date.now(),
    });

    this.logger.log({ event: 'room_closed', roomId, by: user.sub });
    return closed;
  }

  // ── Verify membership ─────────────────────────────────────────────────────────

  async assertMember(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Xona topilmadi');

    const userRec = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isGlobalOperator = userRec && ['operator', 'supervisor', 'admin'].includes(userRec.role);
    if (isGlobalOperator) return room;

    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!member || member.leftAt) throw new ForbiddenException('Ushbu xonaga ruxsat yo\'q');

    return room;
  }
}
