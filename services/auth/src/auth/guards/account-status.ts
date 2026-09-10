import { UnauthorizedException } from '@nestjs/common';

/**
 * Hisob holatini bazadan tekshiradi. Baza — yagona haqiqat manbai:
 * Redis'dagi bekor qilish kaliti muddati tugasa ham bu tekshiruv ishlaydi.
 * Har so'rovda bazaga bormaslik uchun qisqa muddatli xotira keshi ishlatiladi.
 */
const TTL_MS = 10_000;
const MAX_ENTRIES = 10_000;

const cache = new Map<string, { status: string; role: string; exp: number }>();

export function invalidateAccountStatus(userId: string): void {
  cache.delete(userId);
}

export async function assertAccountActive(
  prisma: { user: { findUnique: Function } },
  userId: string,
  tokenRole?: string,
): Promise<string> {
  const now = Date.now();
  const hit = cache.get(userId);

  let status: string;
  let role: string;
  if (hit && hit.exp > now) {
    status = hit.status;
    role = hit.role;
  } else {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, role: true },
    });
    // Foydalanuvchi topilmasa — token yaroqsiz deb hisoblanadi
    status = user?.status ?? 'deleted';
    role = user?.role ?? 'none';
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(userId, { status, role, exp: now + TTL_MS });
  }

  if (status !== 'active') {
    throw new UnauthorizedException('Hisob faol emas — sessiya bekor qilingan');
  }

  if (tokenRole && role !== tokenRole) {
    throw new UnauthorizedException('Foydalanuvchi huquqlari o\'zgargan — qayta kirish talab qilinadi');
  }

  return role;
}
