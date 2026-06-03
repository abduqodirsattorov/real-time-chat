import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { UpsertTransactionDto, ListTransactionsQuery } from './dto/transactions.dto';
import { Prisma } from '@prisma/client';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── LIST (filtr, qidiruv, pagination) ────────────────────────────────────
  async list(user: JwtUser, productId: string, q: ListTransactionsQuery) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    const limit = Math.min(q.limit ?? 30, 100);
    const offset = q.offset ?? 0;

    // Phone bo'yicha user_uid aniqlash
    let resolvedUserUid = q.userUid;
    if (q.phone && !resolvedUserUid) {
      const u = await this.prisma.user.findFirst({ where: { phone: q.phone } });
      if (u) {
        const cust = await this.prisma.customer.findFirst({
          where: { productId, userId: u.id },
          select: { externalUid: true },
        });
        resolvedUserUid = cust?.externalUid ?? undefined;
        if (!resolvedUserUid) {
          // phone topildi lekin customer yo'q → bo'sh natija
          return { items: [], total: 0, limit, offset };
        }
      } else {
        return { items: [], total: 0, limit, offset };
      }
    }

    // JSONB filtrlar uchun raw SQL qurish
    const conditions: string[] = [`t.product_id = $1::uuid`];
    const params: unknown[] = [productId];
    let idx = 2;

    if (resolvedUserUid) {
      conditions.push(`t.user_uid = $${idx++}`);
      params.push(resolvedUserUid);
    }
    if (q.dateFrom) {
      conditions.push(`t.created_at >= $${idx++}::timestamptz`);
      params.push(q.dateFrom);
    }
    if (q.dateTo) {
      conditions.push(`t.created_at <= $${idx++}::timestamptz`);
      params.push(q.dateTo);
    }
    if (q.provider) {
      conditions.push(`t.data->>'provider' = $${idx++}`);
      params.push(q.provider);
    }
    if (q.type) {
      conditions.push(`t.data->>'type' = $${idx++}`);
      params.push(q.type);
    }
    if (q.debitState) {
      conditions.push(`t.data->>'debit_state' = $${idx++}`);
      params.push(q.debitState);
    }
    if (q.creditState) {
      conditions.push(`t.data->>'credit_state' = $${idx++}`);
      params.push(q.creditState);
    }

    const where = conditions.join(' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id,
                t.product_id   AS "productId",
                t.external_id  AS "externalId",
                t.user_uid     AS "userUid",
                t.data,
                t.created_at   AS "createdAt",
                t.updated_at   AS "updatedAt"
         FROM transactions t
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        ...params, limit, offset,
      ),
      this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM transactions t WHERE ${where}`,
        ...params,
      ),
    ]);

    return {
      items: rows,
      total: Number(countRows[0].count),
      limit,
      offset,
    };
  }

  // ── GET ONE ───────────────────────────────────────────────────────────────
  async getOne(user: JwtUser, productId: string, id: string) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.productId !== productId) throw new NotFoundException('Tranzaksiya topilmadi');
    return tx;
  }

  // ── UPSERT ────────────────────────────────────────────────────────────────
  async upsert(user: JwtUser, dto: UpsertTransactionDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    return this.prisma.transaction.upsert({
      where: { productId_externalId: { productId: dto.productId, externalId: dto.externalId } },
      create: {
        productId: dto.productId,
        externalId: dto.externalId,
        userUid: dto.userUid,
        data: dto.data as Prisma.InputJsonObject,
      },
      update: {
        ...(dto.userUid ? { userUid: dto.userUid } : {}),
        data: dto.data as Prisma.InputJsonObject,
      },
    });
  }
}
