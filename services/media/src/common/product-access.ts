import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from './decorators/current-user.decorator';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

/**
 * Mahsulot (tenant) izolyatsiyasining yagona tekshiruv nuqtasi (media-service).
 */
export async function assertProductAccess(
  prisma: { operatorProduct: { findFirst: Function } },
  user: JwtUser,
  productId: string | null | undefined,
): Promise<void> {
  if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
  if (user.role === 'admin') return;
  if (!productId) return;

  const allowed = await prisma.operatorProduct.findFirst({
    where: { userId: user.sub, productId },
  });

  if (!allowed) {
    throw new ForbiddenException('Ushbu mahsulotga ruxsatingiz yo\'q');
  }
}

/** Foydalanuvchiga ruxsat etilgan mahsulot ID'lari (admin uchun null = cheklovsiz). */
export async function allowedProductIds(
  prisma: { operatorProduct: { findMany: Function } },
  user: JwtUser,
): Promise<string[] | null> {
  if (user.role === 'admin') return null;
  const rows = await prisma.operatorProduct.findMany({
    where: { userId: user.sub },
    select: { productId: true },
  });
  return rows.map((r: { productId: string }) => r.productId);
}
