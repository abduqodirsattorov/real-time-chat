import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { UpsertTransactionDto, ListTransactionsQuery } from './dto/transactions.dto';
import { Prisma } from '@prisma/client';

const OPERATOR_ROLES = new Set(['operator', 'supervisor', 'admin']);

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── LIST ─────────────────────────────────────────────────────────────────
  async list(user: JwtUser, productId: string, q: ListTransactionsQuery) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();

    const limit = Math.min(q.limit ?? 20, 100);
    const offset = q.offset ?? 0;

    const conditions: string[] = [`t.product_id = $1::uuid`];
    const params: unknown[] = [productId];
    let idx = 2;

    // userUid (chatdan direct filter)
    if (q.userUid) {
      conditions.push(`t.user_uid = $${idx++}`);
      params.push(q.userUid);
    }

    // search: external_id OR data.phone
    if (q.search) {
      conditions.push(
        `(t.external_id ILIKE $${idx} OR t.data->>'phone' ILIKE $${idx})`,
      );
      params.push(`%${q.search}%`);
      idx++;
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
      conditions.push(`lower(t.data->>'debit_state') = lower($${idx++})`);
      params.push(q.debitState);
    }
    if (q.creditState) {
      conditions.push(`lower(t.data->>'credit_state') = lower($${idx++})`);
      params.push(q.creditState);
    }
    if (q.strana) {
      conditions.push(`t.data->>'strana' = $${idx++}`);
      params.push(q.strana);
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

    await this.audit.log({
      actorId: user.sub,
      action: 'transactions_list',
      targetType: 'product',
      targetId: productId,
      payload: { userUid: q.userUid, search: q.search, count: rows.length },
    });

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
    const [rows] = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id,
              t.product_id   AS "productId",
              t.external_id  AS "externalId",
              t.user_uid     AS "userUid",
              t.data,
              t.created_at   AS "createdAt",
              t.updated_at   AS "updatedAt"
       FROM transactions t
       WHERE t.id = $1::uuid AND t.product_id = $2::uuid`,
      id, productId,
    );
    if (!rows) throw new NotFoundException('Tranzaksiya topilmadi');

    await this.audit.log({
      actorId: user.sub,
      action: 'transaction_read',
      targetType: 'transaction',
      targetId: id,
      payload: { productId, externalId: rows.externalId },
    });

    return rows;
  }

  // ── UPSERT ────────────────────────────────────────────────────────────────
  async upsert(user: JwtUser, dto: UpsertTransactionDto) {
    if (!OPERATOR_ROLES.has(user.role)) throw new ForbiddenException();
    const tx = await this.prisma.transaction.upsert({
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

    await this.audit.log({
      actorId: user.sub,
      action: 'transaction_upsert',
      targetType: 'transaction',
      targetId: tx.id,
      payload: { productId: dto.productId, externalId: dto.externalId },
    });

    return tx;
  }
}
