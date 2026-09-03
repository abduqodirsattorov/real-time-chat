import { UnauthorizedException } from '@nestjs/common';

/**
 * Hisob holatini bazadan tekshiradi. Baza — yagona haqiqat manbai:
 * Redis'dagi bekor qilish kaliti muddati tugasa ham bu tekshiruv ishlaydi.
 * Har so'rovda bazaga bormaslik uchun qisqa muddatli xotira keshi ishlatiladi.
 */
const TTL_MS = 10_000;
const MAX_ENTRIES = 10_000;

const cache = new Map<string, { status: string; exp: number }>();

export function invalidateAccountStatus(userId: string): void {
  cache.delete(userId);
}

export async function assertAccountActive(
  prisma: { user: { findUnique: Function } },
  userId: string,
): Promise<void> {
  const now = Date.now();
  const hit = cache.get(userId);

  let status: string;
  if (hit && hit.exp > now) {
    status = hit.status;
  } else {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    // Foydalanuvchi topilmasa — token yaroqsiz deb hisoblanadi
    status = user?.status ?? 'deleted';
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(userId, { status, exp: now + TTL_MS });
  }

  if (status !== 'active') {
    throw new UnauthorizedException('Hisob faol emas — sessiya bekor qilingan');
  }
}
