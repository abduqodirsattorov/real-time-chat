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
import { Prisma } from '@prisma/client';
import { assertProductAccess, allowedProductIds } from '../common/product-access';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly centrifugo: CentrifugoService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  // ── List rooms ───────────────────────────────────────────────────────────────

  async list(user: JwtUser, dto: ListRoomsDto, productId?: string) {
    const limit = dto.limit ?? 50;
    let cursorDate: Date | undefined;

    if (dto.cursor) {
      try {
        cursorDate = new Date(Buffer.from(dto.cursor, 'base64').toString('utf8'));
      } catch {}
    }

    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);

    let productFilter: any = {};
    if (isOperator) {
      if (user.role === 'admin') {
        productFilter = productId ? { productId } : {};
      } else if (productId) {
        const hasAccess = await this.prisma.operatorProduct.findFirst({
          where: { userId: user.sub, productId },
        });
        if (!hasAccess) throw new ForbiddenException('Ushbu mahsulotga ruxsat yo\'q');
        productFilter = { productId };
      } else {
        const ops = await this.prisma.operatorProduct.findMany({
          where: { userId: user.sub },
          select: { productId: true },
        });
        const productIds = ops.map(o => o.productId);
        productFilter = { productId: { in: productIds } };
      }
    }

    const tagFilter = dto.tagId
      ? { tagIds: { has: dto.tagId } }
      : {};

    const where: any = {
      ...(dto.status ? { status: dto.status as any } : {}),
      ...(dto.type ? { type: dto.type as any } : {}),
      ...(!isOperator ? {
        members: { some: { userId: user.sub, leftAt: null } },
      } : {}),
      ...productFilter,
      ...tagFilter,
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

    // Batch-fetch customer names for display
    const customerIds = [...new Set(items.map(r => r.customerId).filter(Boolean))] as string[];
    const customerMap = new Map<string, { fullName: string | null; phone: string | null }>();
    if (customerIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, fullName: true, phone: true },
      });
      users.forEach(u => customerMap.set(u.id, { fullName: u.fullName, phone: u.phone }));
    }

    const enriched = items.map(r => ({
      ...r,
      customerName: r.customerId ? (customerMap.get(r.customerId)?.fullName ?? null) : null,
      customerPhone: r.customerId ? (customerMap.get(r.customerId)?.phone ?? null) : null,
    }));

    const nextCursor = hasMore && items[items.length - 1].lastMessageAt
      ? Buffer.from(items[items.length - 1].lastMessageAt!.toISOString()).toString('base64')
      : null;

    return { items: enriched, nextCursor, hasMore };
  }

  // ── Search user by phone (for inbox search feature) ─────────────────────────

  async searchUser(user: JwtUser, phone: string, productId?: string) {
    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (!isOperator) throw new ForbiddenException();

    if (productId) await assertProductAccess(this.prisma, user, productId);
    const productIds = productId ? [productId] : await allowedProductIds(this.prisma, user);
    if (productIds?.length === 0) return null;

    // Scope the user lookup itself, including customers without an active room.
    const scope = productIds === null ? Prisma.empty : Prisma.sql`
      AND (
        EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id AND c.product_id = ANY(${productIds}::uuid[]))
        OR EXISTS (SELECT 1 FROM rooms r WHERE r.customer_id = u.id AND r.product_id = ANY(${productIds}::uuid[]))
      )`;
    const [found] = await this.prisma.$queryRaw<{ id: string; fullName: string | null; phone: string | null }[]>(Prisma.sql`
      SELECT u.id, u.full_name AS "fullName", u.phone FROM users u
      WHERE strpos(lower(u.phone), lower(${phone})) > 0 ${scope}
      ORDER BY u.id LIMIT 1
    `);
    if (!found) return null;

    const room = await this.prisma.room.findFirst({
      where: {
        customerId: found.id,
        status: { in: ['open', 'pending', 'bot_handling'] as any },
        ...(productIds === null ? {} : { productId: { in: productIds } }),
      },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, status: true },
    });

    return { user: found, room: room ?? null };
  }

  // ── Create room ──────────────────────────────────────────────────────────────

  async create(user: JwtUser, dto: CreateRoomDto, productId?: string) {
    if (['operator', 'supervisor', 'admin'].includes(user.role)) {
      await assertProductAccess(this.prisma, user, productId);
    }
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
        ...(productId ? { productId } : {}),
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

    if (isOperator && !isMember) await assertProductAccess(this.prisma, user, room.productId);

    return room;
  }

  // ── Update room ──────────────────────────────────────────────────────────────

  async update(user: JwtUser, roomId: string, dto: UpdateRoomDto) {
    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (!isOperator) throw new ForbiddenException('Faqat operatorlar yangilashi mumkin');

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Xona topilmadi');
    await assertProductAccess(this.prisma, user, room.productId);

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
    await assertProductAccess(this.prisma, user, room.productId);
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

    if (userRec?.role === 'admin') return room;

    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (member && !member.leftAt) return room;

    if (userRec && ['operator', 'supervisor'].includes(userRec.role)) {
      await assertProductAccess(this.prisma, { sub: userId, role: userRec.role } as JwtUser, room.productId);
      return room;
    }
    if (!member || member.leftAt) throw new ForbiddenException('Ushbu xonaga ruxsat yo\'q');

    return room;
  }
}
