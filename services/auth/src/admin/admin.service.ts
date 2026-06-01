import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(opts: { role?: string; page: number; limit: number }) {
    const where = opts.role
      ? { role: opts.role as UserRole, status: UserStatus.active }
      : { status: UserStatus.active, role: { in: ['operator', 'supervisor', 'admin'] as UserRole[] } };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, fullName: true, email: true, role: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: opts.page, limit: opts.limit };
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

    // operator va supervisor uchun operator_states record yaratish
    if (role !== 'admin') {
      await this.prisma.$executeRaw`
        INSERT INTO operator_states
          (user_id, status, active_chats, max_concurrent_chats, on_call, skills, languages, is_supervisor, last_status_at)
        VALUES
          (${user.id}::uuid, 'offline', 0, 5, false, '{}', '{uz}', ${role === 'supervisor'}, NOW())
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    return user;
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, fullName: true, email: true, role: true, status: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
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
    return this.prisma.user.update({
      where: { id },
      data: updates,
      select: { id: true, fullName: true, email: true, role: true },
    });
  }

  async updatePassword(id: string, password: string) {
    await this.getUser(id);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'Parol yangilandi' };
  }

  async deleteUser(id: string, requestingUserId: string) {
    if (id === requestingUserId) throw new ForbiddenException('O\'zingizni o\'chira olmaysiz');
    await this.getUser(id);
    await this.prisma.user.update({ where: { id }, data: { status: 'deleted' } });
    return { message: 'Foydalanuvchi o\'chirildi' };
  }
}
