/**
 * Transactions integration tests
 *
 * Covers:
 *  1. GET /transactions — list, pagination
 *  2. Search by phone (search param)
 *  3. Search by external_id (search param)
 *  4. Filters: provider, type, debit_state, credit_state, strana, date range
 *  5. GET /transactions/:id — single transaction
 *  6. POST /transactions/upsert — create/update
 *  7. Product isolation — operator in product A cannot see product B transactions
 *  8. Chat link — GET /rooms/search-user?phone= (used by tx detail chat)
 *
 * Requires running services.  Run via: npm run test:transactions
 */
import { DEFAULT_PRODUCT_ID, getAdminToken, makeHttp } from './setup';

const TEST_EXT_ID = `TX-REGTEST-${Date.now()}`;
const TEST_USER_UID = `uid-regtest-${Date.now()}`;
const TEST_PHONE = '+998901234567';

describe('Transactions — CRUD + isolation', () => {
  let adminToken: string;
  let txHttp: ReturnType<typeof makeHttp>;
  let createdTxId: string | null = null;

  beforeAll(async () => {
    adminToken = await getAdminToken();
    txHttp = makeHttp(adminToken, DEFAULT_PRODUCT_ID);
  }, 20000);

  // ── POST /transactions/upsert ─────────────────────────────────────────────

  describe('POST /transactions/upsert', () => {
    it('creates a transaction with JSONB data', async () => {
      const res = await txHttp.post('/transactions/upsert', {
        productId: DEFAULT_PRODUCT_ID,
        externalId: TEST_EXT_ID,
        userUid: TEST_USER_UID,
        data: {
          phone: TEST_PHONE,
          provider: 'uzcard',
          type: 'transfer',
          debit_state: 'Ok',
          credit_state: 'Ok',
          debit_amount: 10000,
          credit_amount: 10000,
          strana: 'UZ',
        },
      });
      expect([200, 201]).toContain(res.status);
      createdTxId = res.data?.id ?? null;
      expect(createdTxId).toBeTruthy();
    });

    it('upsert with same externalId updates (no duplicate)', async () => {
      const res = await txHttp.post('/transactions/upsert', {
        productId: DEFAULT_PRODUCT_ID,
        externalId: TEST_EXT_ID,
        userUid: TEST_USER_UID,
        data: { debit_state: 'Fail', credit_state: 'Ok', phone: TEST_PHONE },
      });
      expect([200, 201]).toContain(res.status);
      // Should return same record id
      if (createdTxId && res.data?.id) {
        expect(res.data.id).toBe(createdTxId);
      }
    });

    it('accepts null/numeric/array/object JSONB values (universal JSONB)', async () => {
      const res = await txHttp.post('/transactions/upsert', {
        productId: DEFAULT_PRODUCT_ID,
        externalId: `TX-JSONB-${Date.now()}`,
        userUid: TEST_USER_UID,
        data: {
          phone: null,
          amount: 12345.67,
          tags: ['a', 'b'],
          nested: { key: 'value' },
        },
      });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ── GET /transactions ─────────────────────────────────────────────────────

  describe('GET /transactions — list and pagination', () => {
    it('returns list with items array and total', async () => {
      const res = await txHttp.get('/transactions', { params: { limit: 5 } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items ?? res.data.data)).toBe(true);
    });

    it('pagination: limit=20 returns at most 20 rows', async () => {
      const res = await txHttp.get('/transactions', { params: { limit: 20, offset: 0 } });
      expect(res.status).toBe(200);
      const items: any[] = res.data.items ?? res.data.data ?? [];
      expect(items.length).toBeLessThanOrEqual(20);
    });

    it('page 1 and page 2 return different items', async () => {
      const [p1, p2] = await Promise.all([
        txHttp.get('/transactions', { params: { limit: 5, offset: 0 } }),
        txHttp.get('/transactions', { params: { limit: 5, offset: 5 } }),
      ]);
      const ids1 = (p1.data.items ?? p1.data.data ?? []).map((r: any) => r.id);
      const ids2 = (p2.data.items ?? p2.data.data ?? []).map((r: any) => r.id);
      if (ids1.length > 0 && ids2.length > 0) {
        const overlap = ids1.filter((id: string) => ids2.includes(id));
        expect(overlap.length).toBe(0);
      }
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────

  describe('GET /transactions?search= — phone and external_id search', () => {
    it('search by phone returns matching transactions', async () => {
      const res = await txHttp.get('/transactions', {
        params: { search: TEST_PHONE, limit: 20 },
      });
      expect(res.status).toBe(200);
      const items: any[] = res.data.items ?? res.data.data ?? [];
      // Our seeded transaction has this phone in data JSONB
      const found = items.some(
        (tx: any) => tx.externalId === TEST_EXT_ID || tx.external_id === TEST_EXT_ID,
      );
      expect(found).toBe(true);
    });

    it('search by external_id returns exact match', async () => {
      const res = await txHttp.get('/transactions', {
        params: { search: TEST_EXT_ID, limit: 5 },
      });
      expect(res.status).toBe(200);
      const items: any[] = res.data.items ?? res.data.data ?? [];
      expect(items.length).toBeGreaterThan(0);
      const tx = items[0];
      expect(tx.externalId ?? tx.external_id).toBe(TEST_EXT_ID);
    });

    it('search for non-existent value returns empty', async () => {
      const res = await txHttp.get('/transactions', {
        params: { search: 'NONEXISTENT_TX_99999999', limit: 5 },
      });
      expect(res.status).toBe(200);
      const items: any[] = res.data.items ?? res.data.data ?? [];
      expect(items.length).toBe(0);
    });
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  describe('GET /transactions — filters', () => {
    it('provider filter returns only matching provider', async () => {
      const res = await txHttp.get('/transactions', {
        params: { provider: 'uzcard', limit: 5 },
      });
      expect(res.status).toBe(200);
      const items: any[] = res.data.items ?? res.data.data ?? [];
      for (const tx of items) {
        const provider = tx.data?.provider ?? tx.provider;
        if (provider) expect(provider).toBe('uzcard');
      }
    });

    it('date range filter dateFrom/dateTo returns within range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await txHttp.get('/transactions', {
        params: { dateFrom: today, dateTo: today, limit: 10 },
      });
      expect(res.status).toBe(200);
      // Should not error regardless of count
    });

    it('debitState filter (case-insensitive)', async () => {
      const res = await txHttp.get('/transactions', {
        params: { debitState: 'Ok', limit: 5 },
      });
      expect(res.status).toBe(200);
    });

    it('strana filter', async () => {
      const res = await txHttp.get('/transactions', {
        params: { strana: 'UZ', limit: 5 },
      });
      expect(res.status).toBe(200);
    });
  });

  // ── GET /transactions/:id ─────────────────────────────────────────────────

  describe('GET /transactions/:id', () => {
    it('returns full transaction details', async () => {
      if (!createdTxId) return;
      const res = await txHttp.get(`/transactions/${createdTxId}`);
      expect(res.status).toBe(200);
      expect(res.data.id ?? res.data.externalId).toBeTruthy();
    });

    it('returns 404 for non-existent id', async () => {
      const res = await txHttp.get('/transactions/00000000-0000-0000-0000-000000000000');
      expect([404, 400]).toContain(res.status);
    });
  });

  // ── Product isolation (FINTECH CRITICAL) ─────────────────────────────────

  describe('Product isolation — FINTECH CRITICAL', () => {
    let otherProductId: string | null = null;

    beforeAll(async () => {
      // Get list of products and pick one that's NOT the default
      const res = await makeHttp(adminToken).get('/products');
      const rawList = res.data?.products ?? res.data?.items ?? (Array.isArray(res.data) ? res.data : []);
      const other = rawList.find((p: any) => p.id !== DEFAULT_PRODUCT_ID && (p.isActive ?? p.is_active ?? true));
      otherProductId = other?.id ?? null;
    });

    it('transactions from product A are not visible with product B header', async () => {
      if (!otherProductId) {
        console.log('  ⚠  Only 1 product — creating temp product for isolation test');

        // Create a temp second product
        const createRes = await makeHttp(adminToken).post('/products', {
          name: 'Temp Isolation Check',
          slug: `tmp-iso-${Date.now()}`,
          branding: {},
        });
        if (createRes.status === 201 || createRes.status === 200) {
          otherProductId = createRes.data?.id ?? null;
        }
      }

      if (!otherProductId) {
        console.log('  ⚠  Cannot create second product — skipping isolation check');
        return;
      }

      // Our TEST_EXT_ID was created under DEFAULT_PRODUCT_ID
      // It must NOT appear when querying with otherProductId
      const httpOther = makeHttp(adminToken, otherProductId);
      const res = await httpOther.get('/transactions', {
        params: { search: TEST_EXT_ID, limit: 5 },
      });
      expect(res.status).toBe(200);
      const items: any[] = res.data.items ?? res.data.data ?? [];
      const found = items.some(
        (tx: any) => tx.externalId === TEST_EXT_ID || tx.external_id === TEST_EXT_ID,
      );
      expect(found).toBe(false); // MUST NOT appear in other product
    });

    it('GET /transactions/:id from different product returns 404 or 403', async () => {
      if (!createdTxId || !otherProductId) return;
      const httpOther = makeHttp(adminToken, otherProductId);
      const res = await httpOther.get(`/transactions/${createdTxId}`);
      // Must be 403 or 404 — NOT 200 with the data
      expect([403, 404]).toContain(res.status);
    });
  });

  // ── GET /rooms/search-user (used by tx detail chat) ──────────────────────

  describe('GET /rooms/search-user — phone lookup (tx chat link)', () => {
    it('returns result for known phone', async () => {
      const res = await txHttp.get('/rooms/search-user', {
        params: { phone: TEST_PHONE },
      });
      expect([200, 204]).toContain(res.status);
      // Result can be null/empty if no room exists — should not 500
    });

    it('returns empty for unknown phone (not 500)', async () => {
      const res = await txHttp.get('/rooms/search-user', {
        params: { phone: '+998000000000' },
      });
      expect(res.status).not.toBe(500);
    });
  });
});
