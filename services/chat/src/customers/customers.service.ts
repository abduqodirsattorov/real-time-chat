import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { UpsertCustomerDto, UpdateCustomerDto } from './dto/customers.dto';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── GET by room ────────────────────────────────────────────────────────────
  async getByRoom(user: JwtUser, roomId: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { customerId: true, productId: true },
    });
    if (!room) throw new NotFoundException('Xona topilmadi');
    if (!room.customerId) return null;

    // Upsert: customer yozuv bo'lmasa — bo'sh profil yaratamiz
    const customer = await this.prisma.customer.upsert({
      where: { productId_userId: { productId: room.productId ?? '', userId: room.customerId } },
      create: {
        productId: room.productId ?? '',
        userId: room.customerId,
        profileData: {},
      },
      update: {},
    });

    // Enrich with user info (phone, fullName from users table)
    const userInfo = await this.prisma.user.findUnique({
      where: { id: room.customerId },
      select: { id: true, fullName: true, phone: true, locale: true, createdAt: true },
    });

    await this.audit.log({
      actorId: user.sub,
      action: 'customer_read_by_room',
      targetType: 'customer',
      targetId: customer.id,
      payload: { roomId, customerId: room.customerId, productId: room.productId },
    });

    return { ...customer, user: userInfo };
  }

  // ── GET by uid ─────────────────────────────────────────────────────────────
  async getByUid(user: JwtUser, productId: string, uid: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    const customer = await this.prisma.customer.findUnique({
      where: { productId_externalUid: { productId, externalUid: uid } },
    });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');

    await this.audit.log({
      actorId: user.sub,
      action: 'customer_read_by_uid',
      targetType: 'customer',
      targetId: customer.id,
      payload: { productId, externalUid: uid },
    });

    return customer;
  }

  // ── Upsert ─────────────────────────────────────────────────────────────────
  async upsert(user: JwtUser, dto: UpsertCustomerDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    // userId bilan upsert
    if (dto.userId) {
      return this.prisma.customer.upsert({
        where: { productId_userId: { productId: dto.productId, userId: dto.userId } },
        create: {
          productId: dto.productId,
          userId: dto.userId,
          externalUid: dto.externalUid,
          profileData: (dto.profileData as any) ?? {},
        },
        update: {
          ...(dto.externalUid ? { externalUid: dto.externalUid } : {}),
          ...(dto.profileData ? { profileData: dto.profileData as any } : {}),
        },
      });
    }

    // externalUid bilan upsert
    return this.prisma.customer.upsert({
      where: { productId_externalUid: { productId: dto.productId, externalUid: dto.externalUid! } },
      create: {
        productId: dto.productId,
        externalUid: dto.externalUid,
        profileData: (dto.profileData as any) ?? {},
      },
      update: {
        ...(dto.profileData ? { profileData: dto.profileData as any } : {}),
      },
    });
  }

  // ── GET chat history ───────────────────────────────────────────────────────
  async getHistory(
    user: JwtUser,
    customerId: string,
    productId: string,
    limit = 10,
    cursor?: string,
  ) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    if (customer.productId !== productId) throw new ForbiddenException();

    const userId = customer.userId;
    if (!userId) return { items: [], hasMore: false, nextCursor: null };

    let cursorDate: Date | undefined;
    if (cursor) {
      try { cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf8')); } catch {}
    }

    const rooms = await this.prisma.room.findMany({
      where: {
        customerId: userId,
        productId: customer.productId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = rooms.length > limit;
    const items = hasMore ? rooms.slice(0, limit) : rooms;

    if (items.length === 0) return { items: [], hasMore: false, nextCursor: null };

    // Oxirgi xabarni har xona uchun bitta so'rovda olamiz
    const roomIds = items.map((r) => r.id);
    const lastMsgs: Array<{ room_id: string; content: string; type: string }> =
      await this.prisma.$queryRaw`
        SELECT DISTINCT ON (room_id) room_id, content, type
        FROM messages
        WHERE room_id = ANY(${roomIds}::uuid[])
        ORDER BY room_id, created_at DESC
      `;
    const msgMap = new Map(lastMsgs.map((m) => [m.room_id, m]));

    const nextCursor = hasMore
      ? Buffer.from(items[items.length - 1].createdAt.toISOString()).toString('base64')
      : null;

    await this.audit.log({
      actorId: user.sub,
      action: 'customer_history_read',
      targetType: 'customer',
      targetId: customerId,
      payload: { productId, roomCount: items.length },
    });

    return {
      items: items.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        closedAt: r.closedAt,
        lastMessageAt: r.lastMessageAt,
        tagIds: r.tagIds,
        lastMessage: msgMap.has(r.id)
          ? { content: msgMap.get(r.id)!.content, type: msgMap.get(r.id)!.type }
          : null,
      })),
      hasMore,
      nextCursor,
    };
  }

  // ── PATCH notes/tags ───────────────────────────────────────────────────────
  async update(user: JwtUser, id: string, dto: UpdateCustomerDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.profileData ? { profileData: dto.profileData as any } : {}),
      },
    });
  }
}
