import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserRole, UserStatus } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;
const K = {
  sessions: (userId: string) => `auth:sessions:${userId}`,
  refresh: (jti: string) => `auth:refresh:${jti}`,
  revoked: (userId: string) => `auth:revoked:${userId}`,
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listUsers(opts: { role?: string; page: number; limit: number }) {
    const where = opts.role
      ? { role: opts.role as UserRole, status: UserStatus.active }
      : { status: UserStatus.active, role: { in: ['operator', 'supervisor', 'admin'] as UserRole[] } };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, fullName: true, email: true, role: true, status: true, createdAt: true,
          operatorProducts: { select: { productId: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((u) => ({
        ...u,
        productIds: u.operatorProducts.map((op) => op.productId),
        operatorProducts: undefined,
      })),
      total, page: opts.page, limit: opts.limit,
    };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Bu email allaqachon ro\'yxatdan o\'tgan');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();
    const role = (dto.role as UserRole) ?? 'operator';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName,
        role,
        status: 'active',
        locale: 'uz',
      },
      select: { id: true, fullName: true, email: true, role: true, createdAt: true },
    });

    // operator_states record
    if (role !== 'admin') {
      await this.prisma.$executeRaw`
        INSERT INTO operator_states
          (user_id, status, active_chats, max_concurrent_chats, on_call, skills, languages, is_supervisor, last_status_at)
        VALUES
          (${user.id}::uuid, 'offline', 0, 5, false, '{}', '{uz}', ${role === 'supervisor'}, NOW())
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    // operator_products — ruxsat etilgan productlar
    const productIds = dto.productIds ?? [];
    if (productIds.length > 0) {
      await this.prisma.$executeRaw`
        INSERT INTO operator_products (user_id, product_id)
        SELECT ${user.id}::uuid, unnest(${productIds}::uuid[])
        ON CONFLICT DO NOTHING
      `;
    }

    return { ...user, productIds };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, fullName: true, email: true, role: true, status: true, createdAt: true,
        operatorProducts: { select: { productId: true } },
      },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return {
      ...user,
      productIds: user.operatorProducts.map((op) => op.productId),
      operatorProducts: undefined,
    };
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    await this.getUser(id);
    const updates: Record<string, unknown> = {};

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const user = await this.prisma.user.findUnique({ where: { id }, select: { fullName: true } });
      const parts = (user?.fullName ?? '').split(' ');
      const first = dto.firstName ?? parts[0] ?? '';
      const last = dto.lastName ?? parts.slice(1).join(' ') ?? '';
      updates.fullName = `${first} ${last}`.trim();
    }

    if (dto.status !== undefined) {
      updates.status = dto.status as UserStatus;
      if (dto.status === 'suspended' || dto.status === 'deleted') {
        await this.redis.set(K.revoked(id), dto.status, 3600);
        const sessions = await this.redis.smembers(K.sessions(id));
        for (const s of sessions) await this.redis.del(K.refresh(s));
        await this.redis.del(K.sessions(id));
        await this.redis.zrem('operator:available', id);
      } else if (dto.status === 'active') {
        await this.redis.del(K.revoked(id));
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updates,
      select: { id: true, fullName: true, email: true, role: true, status: true },
    });

    // Update product permissions if provided
    if (dto.productIds !== undefined) {
      await this.prisma.$executeRaw`DELETE FROM operator_products WHERE user_id = ${id}::uuid`;
      if (dto.productIds.length > 0) {
        await this.prisma.$executeRaw`
          INSERT INTO operator_products (user_id, product_id)
          SELECT ${id}::uuid, unnest(${dto.productIds}::uuid[])
          ON CONFLICT DO NOTHING
        `;
      }
    }

    const productIds = dto.productIds ?? (await this.prisma.operatorProduct.findMany({
      where: { userId: id },
      select: { productId: true },
    })).map((op) => op.productId);

    return { ...updated, productIds };
  }

  async updatePassword(id: string, password: string) {
    await this.getUser(id);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    // Revoke old tokens on password reset
    await this.redis.set(K.revoked(id), 'password_changed', 3600);
    const sessions = await this.redis.smembers(K.sessions(id));
    for (const s of sessions) await this.redis.del(K.refresh(s));
    await this.redis.del(K.sessions(id));

    return { message: 'Parol yangilandi' };
  }

  async deleteUser(id: string, requestingUserId: string) {
    if (id === requestingUserId) throw new ForbiddenException('O\'zingizni o\'chira olmaysiz');
    const target = await this.getUser(id);
    if (target.email === 'admin@pusher.uz') {
      throw new ForbiddenException('Asosiy super adminni o\'chirib bo\'lmaydi');
    }

    await this.prisma.user.update({ where: { id }, data: { status: 'deleted' } });

    // Instantly invalidate access tokens across services
    await this.redis.set(K.revoked(id), 'deleted', 3600);

    // Delete all refresh sessions
    const sessions = await this.redis.smembers(K.sessions(id));
    for (const s of sessions) await this.redis.del(K.refresh(s));
    await this.redis.del(K.sessions(id));

    // Remove from operator pool
    await this.redis.zrem('operator:available', id);

    return { message: 'Foydalanuvchi o\'chirildi' };
  }
}
