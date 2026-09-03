/**
 * Avtorizatsiya matritsasi — SALBIY (negative) testlar.
 *
 * Maqsad: "hamma test o'tdi" degan xulosa xavfsizlikni o'lchamasligi muammosini
 * yopish. Bu yerdagi har bir tekshiruv tizimni BUZIB ko'radi:
 *   1. Rol × endpoint matritsasi (customer / operator / supervisor / admin)
 *   2. Tenantlararo izolyatsiya (begona mahsulot ma'lumotiga kirish)
 *   3. Hisob hayot sikli (o'chirilgan foydalanuvchi hamma joyda bloklanadi)
 *   4. Format fuzzing (buzilgan UUID, yaroqsiz token)
 *   5. Xavfsizlik headerlari
 *
 * Hech bir test tokensiz "jimgina o'tib ketmasligi" kerak — setup xatosi
 * butun to'plamni yiqitadi.
 */
import axios from 'axios';
import {
  BASE, DEFAULT_PRODUCT_ID, getAdminToken, getOtpToken,
  CUSTOMER_PHONE, OPERATOR_PHONE, makeHttp,
} from './setup';

const API = BASE;
const NONEXISTENT_UUID = '00000000-0000-0000-0000-999999999999';

describe('Avtorizatsiya matritsasi (salbiy testlar)', () => {
  let adminToken: string;
  let operatorToken: string;
  let customerToken: string;

  // Operatorga ruxsat berilmagan alohida mahsulot va undagi xona
  let foreignProductId: string;
  let foreignRoomId: string;

  beforeAll(async () => {
    adminToken = await getAdminToken();
    operatorToken = await getOtpToken(OPERATOR_PHONE);
    customerToken = await getOtpToken(CUSTOMER_PHONE);

    const admin = makeHttp(adminToken, DEFAULT_PRODUCT_ID);

    // Izolyatsiya sinovi uchun alohida mahsulot
    const stamp = Date.now();
    const prod = await admin.post('/products', {
      name: `AUDIT-ISOLATION-${stamp}`,
      slug: `audit-isolation-${stamp}`,
      branding: { primaryColor: '#000000' },
    });
    expect([200, 201]).toContain(prod.status);
    foreignProductId = prod.data.id;
    expect(foreignProductId).toBeTruthy();

    // O'sha mahsulotda xona — operatorga ruxsat berilmagan
    const adminForeign = makeHttp(adminToken, foreignProductId);
    const room = await adminForeign.post('/rooms', {
      type: 'support',
      title: 'Audit isolation room',
    });
    expect([200, 201]).toContain(room.status);
    foreignRoomId = room.data.id;
    expect(foreignRoomId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    if (foreignProductId) {
      const admin = makeHttp(adminToken, DEFAULT_PRODUCT_ID);
      await admin.delete(`/products/${foreignProductId}`).catch(() => undefined);
    }
  });

  // ── 1. Rol matritsasi ──────────────────────────────────────────────────────
  describe('1. Rol × endpoint matritsasi', () => {
    it('mijoz operator navbatini ko\'ra olmaydi', async () => {
      const http = makeHttp(customerToken, DEFAULT_PRODUCT_ID);
      const res = await http.get('/calls/queue');
      expect(res.status).toBe(403);
    });

    it('mijoz operatorlar ro\'yxatini ko\'ra olmaydi', async () => {
      const http = makeHttp(customerToken, DEFAULT_PRODUCT_ID);
      const res = await http.get('/operator/online');
      expect([401, 403]).toContain(res.status);
    });

    it('mijoz admin foydalanuvchilar ro\'yxatini ko\'ra olmaydi', async () => {
      const http = makeHttp(customerToken);
      const res = await http.get('/admin/users');
      expect(res.status).toBe(403);
    });

    it('mijoz mijoz profillarini o\'qiy olmaydi', async () => {
      const http = makeHttp(customerToken, DEFAULT_PRODUCT_ID);
      const res = await http.get(`/customers/by-room/${foreignRoomId}`);
      expect(res.status).toBe(403);
    });

    it('mijoz tranzaksiyalarni ko\'ra olmaydi', async () => {
      const http = makeHttp(customerToken, DEFAULT_PRODUCT_ID);
      const res = await http.get('/transactions');
      expect(res.status).toBe(403);
    });

    it('operator admin foydalanuvchi yarata olmaydi', async () => {
      const http = makeHttp(operatorToken);
      const res = await http.post('/admin/users', {
        email: `esc-${Date.now()}@test.uz`,
        password: 'Password123!',
        firstName: 'Esc',
        lastName: 'Test',
        role: 'admin',
      });
      expect(res.status).toBe(403);
    });

    it('operator maydon sozlamalarini o\'zgartira olmaydi', async () => {
      const http = makeHttp(operatorToken, DEFAULT_PRODUCT_ID);
      const res = await http.patch('/field-configs', {
        context: 'tx_table',
        items: [],
      });
      expect([400, 403]).toContain(res.status);
    });

    it('tokensiz so\'rov 401 qaytaradi', async () => {
      const res = await axios.get(`${API}/rooms`, { validateStatus: () => true });
      expect(res.status).toBe(401);
    });
  });

  // ── 2. Tenantlararo izolyatsiya ────────────────────────────────────────────
  describe('2. Tenantlararo izolyatsiya (SEC-02)', () => {
    it('operator begona mahsulot xonasini ocholmaydi', async () => {
      const http = makeHttp(operatorToken, DEFAULT_PRODUCT_ID);
      const res = await http.get(`/rooms/${foreignRoomId}`);
      expect(res.status).toBe(403);
    });

    it('operator begona xona mijoz profilini o\'qiy olmaydi', async () => {
      const http = makeHttp(operatorToken, DEFAULT_PRODUCT_ID);
      const res = await http.get(`/customers/by-room/${foreignRoomId}`);
      expect(res.status).toBe(403);
    });

    it('operator begona mahsulot mijozini uid bo\'yicha qidira olmaydi', async () => {
      const http = makeHttp(operatorToken, foreignProductId);
      const res = await http.get('/customers/by-uid/some-uid');
      expect(res.status).toBe(403);
    });

    it('operator begona mahsulotga mijoz yozib qo\'ya olmaydi', async () => {
      const http = makeHttp(operatorToken, foreignProductId);
      const res = await http.post('/customers/upsert', {
        productId: foreignProductId,
        externalUid: `audit-${Date.now()}`,
        profileData: {},
      });
      expect(res.status).toBe(403);
    });

    it('operator begona mahsulot tranzaksiyalarini ko\'ra olmaydi', async () => {
      const http = makeHttp(operatorToken, foreignProductId);
      const res = await http.get('/transactions');
      expect(res.status).toBe(403);
    });

    it('operator begona mahsulot teglarini ko\'ra olmaydi', async () => {
      const http = makeHttp(operatorToken, foreignProductId);
      const res = await http.get('/tags');
      expect(res.status).toBe(403);
    });

    it('operator begona mahsulot maydon sozlamalarini ko\'ra olmaydi', async () => {
      const http = makeHttp(operatorToken, foreignProductId);
      const res = await http.get('/field-configs?context=tx_table');
      expect(res.status).toBe(403);
    });

    it('operator ruxsatsiz mahsulotga o\'ta olmaydi', async () => {
      const http = makeHttp(operatorToken, DEFAULT_PRODUCT_ID);
      const res = await http.patch('/operator/product', { productId: foreignProductId });
      expect([403, 404]).toContain(res.status);
    });

    it('admin barcha mahsulotlarni ko\'ra oladi (nazorat tekshiruvi)', async () => {
      const http = makeHttp(adminToken, foreignProductId);
      const res = await http.get(`/rooms/${foreignRoomId}`);
      expect(res.status).toBe(200);
    });
  });

  // ── 3. Hisob hayot sikli ───────────────────────────────────────────────────
  describe('3. Hisob hayot sikli (SEC-03)', () => {
    it('o\'chirilgan foydalanuvchi BARCHA servislarda bloklanadi va qayta kira olmaydi', async () => {
      const admin = makeHttp(adminToken, DEFAULT_PRODUCT_ID);
      const email = `lifecycle-${Date.now()}@test.uz`;
      const password = 'LifecyclePass123!';

      const created = await admin.post('/admin/users', {
        email, password, firstName: 'Life', lastName: 'Cycle',
        role: 'operator', productIds: [DEFAULT_PRODUCT_ID],
      });
      expect([200, 201]).toContain(created.status);
      const userId = created.data.id;

      const login = await axios.post(
        `${API}/auth/email-login`, { email, password }, { validateStatus: () => true },
      );
      expect([200, 201]).toContain(login.status);
      const token = login.data.accessToken;
      const victim = makeHttp(token, DEFAULT_PRODUCT_ID);

      // O'chirishdan oldin ishlaydi
      expect((await victim.get('/auth/me')).status).toBe(200);
      expect((await victim.get('/calls?limit=1')).status).toBe(200);

      const del = await admin.delete(`/admin/users/${userId}`);
      expect(del.status).toBe(200);

      // Kesh yangilanishi uchun kutish (guardlarda 10 soniyalik kesh bor)
      await new Promise((r) => setTimeout(r, 11000));

      // Barcha servislar rad etadi — faqat auth va chat emas
      for (const path of ['/auth/me', '/rooms?limit=1', '/calls?limit=1', '/operator/online']) {
        const res = await victim.get(path);
        expect([401, 403]).toContain(res.status);
      }

      // ACD navbatiga qayta kira olmaydi
      const rejoin = await victim.post('/operator/status', { status: 'available' });
      expect([401, 403]).toContain(rejoin.status);

      // Parol bilan qayta login qila olmaydi
      const relogin = await axios.post(
        `${API}/auth/email-login`, { email, password }, { validateStatus: () => true },
      );
      expect([401, 403]).toContain(relogin.status);
    }, 90000);
  });

  // ── 4. Format fuzzing ──────────────────────────────────────────────────────
  describe('4. Buzilgan kirish ma\'lumotlari 500 bermaydi', () => {
    const badIds = ['not-a-uuid', '../../etc/passwd', '%00', "'; DROP TABLE users;--"];

    it.each(badIds)('GET /rooms/%s — 5xx emas', async (bad) => {
      const http = makeHttp(operatorToken, DEFAULT_PRODUCT_ID);
      const res = await http.get(`/rooms/${encodeURIComponent(bad)}`);
      expect(res.status).toBeLessThan(500);
    });

    it.each(badIds)('GET /customers/by-room/%s — 5xx emas', async (bad) => {
      const http = makeHttp(operatorToken, DEFAULT_PRODUCT_ID);
      const res = await http.get(`/customers/by-room/${encodeURIComponent(bad)}`);
      expect(res.status).toBeLessThan(500);
    });

    it('mavjud bo\'lmagan xona uchun obuna tokeni berilmaydi', async () => {
      const http = makeHttp(customerToken);
      const res = await http.post('/auth/centrifugo/subscribe', {
        channel: `chat:room#${NONEXISTENT_UUID}`,
      });
      expect([403, 404]).toContain(res.status);
    });

    it('buzilgan token 401 qaytaradi', async () => {
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: 'Bearer not.a.real.token' },
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });

    it('boshqa secret bilan imzolangan token 401 qaytaradi', async () => {
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        Buffer.from(JSON.stringify({ sub: NONEXISTENT_UUID, role: 'admin' })).toString('base64url') +
        '.ZmFrZXNpZ25hdHVyZQ';
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${forged}` },
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });
  });

  // ── 5. Xavfsizlik headerlari ───────────────────────────────────────────────
  describe('5. Xavfsizlik headerlari', () => {
    it('javoblarda asosiy himoya headerlari mavjud', async () => {
      const res = await axios.get(`${API}/rooms`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'X-Product-Id': DEFAULT_PRODUCT_ID },
        validateStatus: () => true,
      });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    });
  });
});
