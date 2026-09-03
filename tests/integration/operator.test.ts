/**
 * Operator integration tests — regression suite
 *
 * Covers bugs that have broken the system before:
 *  1. operator_states upsert  — admin-created email operator must be able to set status
 *  2. Status flapping         — setStatus(available) must STAY available (not revert to offline)
 *  3. Default product ID      — 00000...0002 must be accepted (IsUUID regression)
 *  4. Operator product switch — PATCH /operator/product must update current_product_id
 *  5. GET /calls              — must not 500 (was crashing on NULL phone fields)
 *
 * Requires running services.  Run via: npm test  (from tests/integration/)
 * Or: npm run test:operator
 */
import axios from 'axios';
import { BASE, DEFAULT_PRODUCT_ID, getAdminToken, makeHttp } from './setup';

const http = axios.create({ baseURL: BASE, validateStatus: () => true });

describe('Operator — regression tests', () => {
  let adminToken: string;
  let adminHttp: ReturnType<typeof makeHttp>;

  beforeAll(async () => {
    adminToken = await getAdminToken();
    adminHttp = makeHttp(adminToken);
  }, 20000);

  // ── Auth ────────────────────────────────────────────────────────────────────

  describe('Email login', () => {
    it('admin@pusher.uz can login with password', async () => {
      const res = await http.post('/auth/email-login', {
        email: 'admin@pusher.uz',
        password: 'Admin12345',
      });
      expect(res.status).toBe(200);
      expect(res.data.accessToken).toBeTruthy();
      expect(res.data.tokenType).toBe('Bearer');
      // role is in JWT payload, not in response body
    });

    it('wrong password returns 401', async () => {
      const res = await http.post('/auth/email-login', {
        email: 'admin@pusher.uz',
        password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
    });

    it('unknown email returns 401', async () => {
      const res = await http.post('/auth/email-login', {
        email: 'nobody@example.com',
        password: 'whatever',
      });
      expect(res.status).toBe(401);
    });
  });

  // ── operator_states upsert (REGRESSION: admin-created operators had no row) ─

  describe('operator_states upsert regression', () => {
    it('setStatus available returns 200 (operator_states row created/updated)', async () => {
      const res = await adminHttp.post('/operator/status', { status: 'available' });
      // 200 or 201 — both are acceptable (upsert)
      expect([200, 201]).toContain(res.status);
    });

    it('setStatus response contains status=available', async () => {
      const res = await adminHttp.post('/operator/status', { status: 'available' });
      expect([200, 201]).toContain(res.status);
      // POST /operator/status returns { userId, status, previous, ts }
      expect(res.data.status).toBe('available');
    });

    it('setStatus offline does not error', async () => {
      const res = await adminHttp.post('/operator/status', { status: 'offline' });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ── Status flapping (REGRESSION: DevTools open caused offline) ──────────────

  describe('Status flapping regression', () => {
    it('operator stays in GET /operator/online list after 3 seconds', async () => {
      // Set available
      const setRes = await adminHttp.post('/operator/status', { status: 'available' });
      expect(setRes.data.status).toBe('available');
      const myId = setRes.data.userId;

      // Wait 3 seconds — old code would revert within ~10s via visibility/unmount beacon
      await new Promise(r => setTimeout(r, 3000));

      // Verify still online
      const onlineRes = await adminHttp.get('/operator/online');
      expect(onlineRes.status).toBe(200);
      const operators: any[] = onlineRes.data?.operators ?? [];
      const me = operators.find((op: any) => op.id === myId);
      expect(me).toBeDefined();
      expect(me?.status).toBe('available');
    }, 15000);
  });

  // ── Extended status: busy, break (Tanaffus) ────────────────────────────────

  describe('Extended operator statuses (busy, break)', () => {
    afterEach(async () => {
      // Har testdan keyin available ga qaytish
      await adminHttp.post('/operator/status', { status: 'available' });
    });

    it('setStatus busy returns 200 with status=busy', async () => {
      const res = await adminHttp.post('/operator/status', { status: 'busy' });
      expect([200, 201]).toContain(res.status);
      expect(res.data.status).toBe('busy');
    });

    it('setStatus break returns 200 with status=break', async () => {
      const res = await adminHttp.post('/operator/status', { status: 'break' });
      expect([200, 201]).toContain(res.status);
      expect(res.data.status).toBe('break');
    });

    it('invalid status returns 400', async () => {
      const res = await adminHttp.post('/operator/status', { status: 'lunch_extra_invalid' });
      expect(res.status).toBe(400);
    });

    it('busy operator NOT in operator:available (ACD isolation)', async () => {
      await adminHttp.post('/operator/status', { status: 'available' });
      const before = await adminHttp.get('/operator/online');
      const setRes = await adminHttp.post('/operator/status', { status: 'busy' });
      const myId = setRes.data.userId;

      const after = await adminHttp.get('/operator/online');
      const operators: any[] = after.data?.operators ?? [];
      const me = operators.find((op: any) => op.id === myId);
      // Band operator available ro'yxatida bo'lmasligi kerak
      expect(me).toBeUndefined();
    });

    it('break operator NOT in operator:available (ACD isolation)', async () => {
      await adminHttp.post('/operator/status', { status: 'available' });
      const setRes = await adminHttp.post('/operator/status', { status: 'break' });
      const myId = setRes.data.userId;

      const after = await adminHttp.get('/operator/online');
      const operators: any[] = after.data?.operators ?? [];
      const me = operators.find((op: any) => op.id === myId);
      // Tanaffusdagi operator available ro'yxatida bo'lmasligi kerak
      expect(me).toBeUndefined();
    });

    it('break → available restores ACD routing', async () => {
      const setRes1 = await adminHttp.post('/operator/status', { status: 'break' });
      const myId = setRes1.data.userId;
      const setRes2 = await adminHttp.post('/operator/status', { status: 'available' });
      expect(setRes2.data.status).toBe('available');

      const after = await adminHttp.get('/operator/online');
      const operators: any[] = after.data?.operators ?? [];
      const me = operators.find((op: any) => op.id === myId);
      expect(me).toBeDefined();
      expect(me?.status).toBe('available');
    });
  });

  // ── Default product ID accepted (REGRESSION: @IsUUID() rejected 000...002) ──

  describe('Default product ID regression', () => {
    it('PATCH /operator/product with default UUID is accepted', async () => {
      const res = await adminHttp.patch('/operator/product', {
        productId: DEFAULT_PRODUCT_ID,
      });
      // 200 OK or 404 if operator_states not yet initialized — but NOT 400 (validation error)
      expect(res.status).not.toBe(400);
    });

    it('POST /support/request with default productId is accepted (not 400)', async () => {
      // This is a customer endpoint — test that the field is accepted
      // (actual room creation may fail without customer context, but should not be 400 from IsUUID)
      const res = await adminHttp.post('/support/request', {
        productId: DEFAULT_PRODUCT_ID,
      });
      // 400 = validation error (bad) | 401/403 = auth error (ok, admin != customer) | 200/201/409 = success
      expect(res.status).not.toBe(400);
    });
  });

  // ── Operator product switch ─────────────────────────────────────────────────

  describe('Operator product switch', () => {
    it('PATCH /operator/product accepts valid UUID', async () => {
      const res = await adminHttp.patch('/operator/product', {
        productId: DEFAULT_PRODUCT_ID,
      });
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(500);
    });
  });

  // ── GET /calls must not 500 (REGRESSION: NULL phone on email operators) ──────

  describe('GET /calls regression (NULL phone)', () => {
    it('GET /calls returns 200 (not 500)', async () => {
      const http = makeHttp(adminToken, DEFAULT_PRODUCT_ID);
      const res = await http.get('/calls', { params: { limit: 5 } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.calls)).toBe(true);
    });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns current user for valid token', async () => {
      const res = await adminHttp.get('/auth/me');
      expect(res.status).toBe(200);
      expect(res.data.email ?? res.data.phone).toBeTruthy();
    });

    it('returns 401 without token', async () => {
      const res = await http.get('/auth/me');
      expect(res.status).toBe(401);
    });
  });

  // ── Supervisor KPI endpoint (Wave 3) ────────────────────────────────────────

  describe('GET /operator/kpi (supervisor)', () => {
    it('admin gets 200 with stats object', async () => {
      // Ensure at least one status entry exists
      await adminHttp.post('/operator/status', { status: 'available' });

      const res = await adminHttp.get('/operator/kpi');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('totalOperators');
      expect(typeof res.data.totalOperators).toBe('number');
      // Taqsimot operator_status enum qiymatlariga mos bo'lishi shart —
      // 'online' degan holat mavjud emas, 'available' bor.
      for (const key of ['available', 'busy', 'onCall', 'inTransfer', 'away', 'break', 'offline']) {
        expect(res.data).toHaveProperty(key);
      }
      expect(res.data).toHaveProperty('timestamp');

      // Endi 'available' operator qo'yganimizdan keyin hisob nolga teng bo'lmasligi kerak
      expect(res.data.available).toBeGreaterThan(0);
      expect(res.data.activeOperators).toBeGreaterThan(0);
    });

    it('unauthenticated request returns 401', async () => {
      const res = await http.get('/operator/kpi');
      expect(res.status).toBe(401);
    });
  });
});
