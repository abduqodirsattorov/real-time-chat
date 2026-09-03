import {
  Injectable, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { assertProductAccess } from '../common/product-access';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List tags for a product ────────────────────────────────────────────────

  async list(user: JwtUser, productId: string) {
    await assertProductAccess(this.prisma, user, productId);
    return this.prisma.tag.findMany({
      where: { productId },
      orderBy: { name: 'asc' },
    });
  }

  // ── Create tag (admin/supervisor only) ─────────────────────────────────────

  async create(user: JwtUser, productId: string, dto: CreateTagDto) {
    this.assertAdmin(user);
    await assertProductAccess(this.prisma, user, productId);

    const existing = await this.prisma.tag.findUnique({
      where: { productId_name: { productId, name: dto.name } },
    });
    if (existing) throw new ConflictException(`"${dto.name}" tegi allaqachon mavjud`);

    return this.prisma.tag.create({
      data: {
        productId,
        name:  dto.name,
        color: dto.color ?? '#6B7280',
      },
    });
  }

  // ── Update tag ─────────────────────────────────────────────────────────────

  async update(user: JwtUser, id: string, productId: string, dto: UpdateTagDto) {
    this.assertAdmin(user);
    await assertProductAccess(this.prisma, user, productId);
    const tag = await this.findOwned(id, productId);

    if (dto.name && dto.name !== tag.name) {
      const conflict = await this.prisma.tag.findUnique({
        where: { productId_name: { productId, name: dto.name } },
      });
      if (conflict) throw new ConflictException(`"${dto.name}" tegi allaqachon mavjud`);
    }

    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(dto.name  ? { name:  dto.name  } : {}),
        ...(dto.color ? { color: dto.color } : {}),
      },
    });
  }

  // ── Delete tag ─────────────────────────────────────────────────────────────

  async remove(user: JwtUser, id: string, productId: string) {
    this.assertAdmin(user);
    await assertProductAccess(this.prisma, user, productId);
    await this.findOwned(id, productId);

    // Remove from all rooms before deleting
    await this.prisma.$executeRaw`
      UPDATE rooms SET tag_ids = array_remove(tag_ids, ${id}::uuid)
      WHERE ${id}::uuid = ANY(tag_ids)
    `;

    await this.prisma.tag.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Set tags on a room ─────────────────────────────────────────────────────

  async setRoomTags(user: JwtUser, roomId: string, tagIds: string[], productId?: string) {
    const isOperator = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (!isOperator) throw new ForbiddenException('Faqat operatorlar teg qo\'ya oladi');

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Xona topilmadi');

    // Xona qaysi mahsulotga tegishli bo'lsa, o'shanga ruxsat kerak
    await assertProductAccess(this.prisma, user, room.productId);

    // Product isolation: tags must belong to operator's product
    if (tagIds.length > 0 && productId) {
      const validTags = await this.prisma.tag.findMany({
        where: { id: { in: tagIds }, productId },
        select: { id: true },
      });
      const validIds = new Set(validTags.map(t => t.id));
      const invalid = tagIds.filter(id => !validIds.has(id));
      if (invalid.length > 0) throw new ForbiddenException('Begona product teglari qo\'llanilmaydi');
    }

    return this.prisma.room.update({
      where: { id: roomId },
      data: { tagIds },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private assertAdmin(user: JwtUser) {
    if (!['admin', 'supervisor'].includes(user.role)) {
      throw new ForbiddenException('Faqat admin/supervisor teg boshqara oladi');
    }
  }

  private async findOwned(id: string, productId: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Teg topilmadi');
    if (tag.productId !== productId) throw new ForbiddenException('Bu teg boshqa productga tegishli');
    return tag;
  }
}
