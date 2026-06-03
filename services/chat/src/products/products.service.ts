import {
  Injectable, ForbiddenException, NotFoundException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const ADMIN_ROLES = new Set(['admin', 'supervisor']);

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── GET /products ─────────────────────────────────────────────────────────────
  // Admin/supervisor: all products (active + inactive)
  // Operator: only products in operator_products (active only)
  // Others (customer): active only
  async list(user?: JwtUser) {
    if (user && ADMIN_ROLES.has(user.role)) {
      const products = await this.prisma.product.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, branding: true, settings: true, isActive: true, createdAt: true },
      });
      return { products };
    }

    if (user && user.role === 'operator') {
      // Only products this operator has permission for
      const allowed = await this.prisma.operatorProduct.findMany({
        where: { userId: user.sub },
        select: { productId: true },
      });
      const allowedIds = allowed.map((op) => op.productId);

      const products = await this.prisma.product.findMany({
        where: { id: { in: allowedIds }, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, branding: true, settings: true, isActive: true, createdAt: true },
      });
      return { products };
    }

    // Customers and others: active only (no restriction)
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, slug: true, branding: true, settings: true, isActive: true, createdAt: true },
    });
    return { products };
  }

  // ── POST /products ────────────────────────────────────────────────────────────
  async create(user: JwtUser, dto: CreateProductDto) {
    if (!ADMIN_ROLES.has(user.role)) throw new ForbiddenException('Faqat adminlar product yarata oladi');

    const existing = await this.prisma.product.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`"${dto.slug}" slug allaqachon mavjud`);

    return this.prisma.product.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        branding: (dto.branding as any) ?? {},
        settings: (dto.settings as any) ?? {},
      },
    });
  }

  // ── PATCH /products/:id ───────────────────────────────────────────────────────
  async update(user: JwtUser, id: string, dto: UpdateProductDto) {
    if (!ADMIN_ROLES.has(user.role)) throw new ForbiddenException('Faqat adminlar o\'zgartira oladi');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product topilmadi');

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.branding !== undefined ? { branding: dto.branding as any } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings as any } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ── DELETE /products/:id (soft delete) ────────────────────────────────────────
  async remove(user: JwtUser, id: string) {
    if (!ADMIN_ROLES.has(user.role)) throw new ForbiddenException('Faqat adminlar o\'chira oladi');

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product topilmadi');

    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    return { id, deleted: true };
  }
}
