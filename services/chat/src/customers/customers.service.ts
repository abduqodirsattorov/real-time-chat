import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { UpsertCustomerDto, UpdateCustomerDto } from './dto/customers.dto';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

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

    return { ...customer, user: userInfo };
  }

  // ── GET by uid ─────────────────────────────────────────────────────────────
  async getByUid(user: JwtUser, productId: string, uid: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    const customer = await this.prisma.customer.findUnique({
      where: { productId_externalUid: { productId, externalUid: uid } },
    });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
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
