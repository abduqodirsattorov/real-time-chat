/**
 * Nova API integration tests
 *
 * Covers:
 *  1. Mock-nova health (no auth)
 *  2. HMAC auth — correct signature → 200
 *  3. HMAC auth — wrong signature → 401
 *  4. HMAC auth — missing API key → 401
 *  5. GET profile, transactions, single transaction, actions
 *  6. POST action execute
 *  7. Via chat-service: GET /api/v1/nova/health (proxy)
 *  8. Via chat-service: GET /api/v1/nova/test/profile/:uid (JWT + Nova)
 *  9. Retry: mock fail-once → chat-service retries → 200
 *
 * Direct mock-nova tests use port 3009.
 * Chat-service proxy tests use port 80 (Traefik).
 *
 * Run: npm run test:nova
 */
import axios from 'axios';
import * as crypto from 'crypto';
import { BASE, getAdminToken, makeHttp } from './setup';

const MOCK_NOVA_URL =
  process.env.MOCK_NOVA_URL ?? 'http://localhost:3009';
const NOVA_API_KEY =
  process.env.NOVA_API_KEY ?? 'nova_api_key_change_me';
const NOVA_HMAC_SECRET =
  process.env.NOVA_HMAC_SECRET ?? 'nova_hmac_secret_change_me_32c';

/** Compute HMAC-SHA256 signature for a request body string */
function sign(body: string): string {
  return crypto.createHmac('sha256', NOVA_HMAC_SECRET).update(body).digest('hex');
}

/** Axios instance for direct mock-nova requests with correct HMAC */
const novaHttp = axios.create({
  baseURL: MOCK_NOVA_URL,
  validateStatus: () => true,
  headers: {
    'X-API-Key': NOVA_API_KEY,
  },
});

/** Make GET request to mock-nova with HMAC on empty body */
async function novaGet(path: string) {
  return novaHttp.get(path, {
    headers: { 'X-Signature': sign('') },
  });
}

/** Make POST request to mock-nova with HMAC on JSON body */
async function novaPost(path: string, body: object) {
  const bodyStr = JSON.stringify(body);
  return novaHttp.post(path, body, {
    headers: {
      'X-Signature': sign(bodyStr),
      'Content-Type': 'application/json',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Mock Nova — direct (port 3009)', () => {
  // ── Health ──────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns status ok without auth', async () => {
      const res = await axios.get(`${MOCK_NOVA_URL}/health`, { validateStatus: () => true });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
      expect(res.data.service).toBe('mock-nova');
    });
  });

  // ── HMAC authentication ──────────────────────────────────────────────────────

  describe('HMAC auth — /api/support/profile/:uid', () => {
    it('correct HMAC → 200', async () => {
      const res = await novaGet('/api/support/profile/uid_test_001');
      expect(res.status).toBe(200);
      expect(res.data.user_uid).toBe('uid_test_001');
    });

    it('wrong HMAC → 401', async () => {
      const res = await novaHttp.get('/api/support/profile/uid_test_001', {
        headers: { 'X-Signature': 'deadbeefdeadbeef' },
      });
      expect(res.status).toBe(401);
      expect(res.data.error).toMatch(/Invalid HMAC/i);
    });

    it('missing X-API-Key → 401', async () => {
      const res = await axios.get(`${MOCK_NOVA_URL}/api/support/profile/uid_test_001`, {
        validateStatus: () => true,
        headers: { 'X-Signature': sign('') },
      });
      expect(res.status).toBe(401);
    });

    it('missing X-Signature → 401', async () => {
      const res = await axios.get(`${MOCK_NOVA_URL}/api/support/profile/uid_test_001`, {
        validateStatus: () => true,
        headers: { 'X-API-Key': NOVA_API_KEY },
      });
      expect(res.status).toBe(401);
      expect(res.data.error).toMatch(/Missing/i);
    });

    it('unknown uid → 404', async () => {
      const res = await novaGet('/api/support/profile/uid_unknown');
      expect(res.status).toBe(404);
    });
  });

  // ── Profile endpoint ──────────────────────────────────────────────────────

  describe('GET /api/support/profile/:uid', () => {
    it('returns profile fields', async () => {
      const res = await novaGet('/api/support/profile/uid_test_001');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        user_uid: 'uid_test_001',
        full_name: expect.any(String),
        phone: expect.any(String),
        is_identified: expect.any(Boolean),
      });
    });
  });

  // ── Transactions list ─────────────────────────────────────────────────────

  describe('GET /api/support/transactions', () => {
    it('returns items array without filter', async () => {
      const res = await novaGet('/api/support/transactions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.total).toBeGreaterThan(0);
    });

    it('filters by user_uid', async () => {
      const res = await novaGet('/api/support/transactions?user_uid=uid_test_001');
      expect(res.status).toBe(200);
      expect(res.data.items.every((t: any) => t.user_uid === 'uid_test_001')).toBe(true);
    });

    it('filters by provider', async () => {
      const res = await novaGet('/api/support/transactions?provider=uzcard');
      expect(res.status).toBe(200);
      expect(res.data.items.every((t: any) => t.provider === 'uzcard')).toBe(true);
    });
  });

  // ── Single transaction ────────────────────────────────────────────────────

  describe('GET /api/support/transaction/:ext_id', () => {
    it('returns transaction by ext_id', async () => {
      const res = await novaGet('/api/support/transaction/TX-MOCK-001');
      expect(res.status).toBe(200);
      expect(res.data.ext_id).toBe('TX-MOCK-001');
      expect(res.data.debit_state).toBe('Ok');
    });

    it('unknown ext_id → 404', async () => {
      const res = await novaGet('/api/support/transaction/TX-MISSING');
      expect(res.status).toBe(404);
    });
  });

  // ── Actions list ──────────────────────────────────────────────────────────

  describe('GET /api/support/transaction/:ext_id/actions', () => {
    it('returns actions array', async () => {
      const res = await novaGet('/api/support/transaction/TX-MOCK-001/actions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.actions)).toBe(true);
      expect(res.data.actions.length).toBeGreaterThan(0);
      expect(res.data.actions[0]).toMatchObject({
        key: expect.any(String),
        label: expect.any(String),
        enabled: expect.any(Boolean),
      });
    });

    it('unknown ext_id returns default actions', async () => {
      const res = await novaGet('/api/support/transaction/TX-UNKNOWN/actions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.actions)).toBe(true);
    });
  });

  // ── Action execute ────────────────────────────────────────────────────────

  describe('POST /api/support/transaction/:ext_id/action', () => {
    it('executes allowed action → success', async () => {
      const body = { action: 'export_csv', operator_id: 'op-test-001', params: {} };
      const res = await novaPost('/api/support/transaction/TX-MOCK-001/action', body);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.result.action).toBe('export_csv');
    });

    it('disabled action → 409', async () => {
      const body = { action: 'recredit_p2p', operator_id: 'op-test-001', params: {} };
      const res = await novaPost('/api/support/transaction/TX-MOCK-001/action', body);
      expect(res.status).toBe(409);
      expect(res.data.error).toBeDefined();
    });

    it('POST with wrong HMAC → 401', async () => {
      const body = { action: 'export_csv', operator_id: 'op-test-001', params: {} };
      const res = await novaHttp.post('/api/support/transaction/TX-MOCK-001/action', body, {
        headers: { 'X-Signature': 'badhash000', 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    });
  });

  // ── fail-once (retry test setup) ─────────────────────────────────────────

  describe('fail-once helper', () => {
    it('sets up fail-once correctly', async () => {
      const setupRes = await axios.post(
        `${MOCK_NOVA_URL}/test/fail-once/TX-FAIL-DIRECT`,
        {},
        { validateStatus: () => true },
      );
      expect(setupRes.status).toBe(200);
      expect(setupRes.data.ok).toBe(true);

      // First call → 503
      const fail = await novaGet('/api/support/transaction/TX-FAIL-DIRECT/actions');
      expect(fail.status).toBe(503);

      // Second call → 200 (fail-once consumed)
      const ok = await novaGet('/api/support/transaction/TX-FAIL-DIRECT/actions');
      expect(ok.status).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Nova via chat-service (port 80)', () => {
  let adminToken: string;
  let http: ReturnType<typeof makeHttp>;

  beforeAll(async () => {
    adminToken = await getAdminToken();
    http = makeHttp(adminToken);
  }, 20_000);

  // ── Health proxy ──────────────────────────────────────────────────────────

  describe('GET /api/v1/nova/health', () => {
    it('returns ok without JWT (public endpoint)', async () => {
      const res = await axios.get(`${BASE}/nova/health`, { validateStatus: () => true });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
    });
  });

  // ── Profile proxy ─────────────────────────────────────────────────────────

  describe('GET /api/v1/nova/test/profile/:uid', () => {
    it('returns Nova profile via chat-service (JWT required)', async () => {
      const res = await http.get('/nova/test/profile/uid_test_001');
      expect(res.status).toBe(200);
      expect(res.data.user_uid).toBe('uid_test_001');
      expect(res.data.full_name).toBeDefined();
    });

    it('requires JWT', async () => {
      const res = await axios.get(`${BASE}/nova/test/profile/uid_test_001`, {
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Actions proxy + retry ─────────────────────────────────────────────────

  describe('GET /api/v1/nova/test/actions/:extId — retry', () => {
    it('retries after 503 and returns 200', async () => {
      const RETRY_KEY = `TX-RETRY-${Date.now()}`;

      // Set up fail-once on mock-nova
      await axios.post(
        `${MOCK_NOVA_URL}/test/fail-once/${RETRY_KEY}`,
        {},
        { validateStatus: () => true },
      );

      // chat-service NovaService should retry and get 200
      const res = await http.get(`/nova/test/actions/${RETRY_KEY}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.actions)).toBe(true);
    });
  });

  // ── Action execute proxy ──────────────────────────────────────────────────

  describe('POST /api/v1/nova/test/action/:extId', () => {
    it('executes action via chat-service (admin role)', async () => {
      const res = await http.post('/nova/test/action/TX-MOCK-002', {
        action: 'recredit_p2p',
        params: {},
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data.success).toBe(true);
    });
  });
});
