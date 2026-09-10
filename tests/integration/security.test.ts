import axios from 'axios';
import * as crypto from 'crypto';
import { BASE, getAdminToken, getOtpToken, CUSTOMER_PHONE, OPERATOR_PHONE } from './setup';

const API = BASE;
const CENTRIFUGO_WEBHOOK_SECRET = process.env.CENTRIFUGO_WEBHOOK_SECRET || 'centrifugo_webhook_secret_32chars_xx';
const NOVA_SSO_SECRET = process.env.NOVA_SSO_SECRET || 'nova_sso_shared_secret_change_me_32chars';
const VALID_UUID_V4 = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

function signCentrifugo(body: any): { bodyStr: string; headers: Record<string, string> } {
  const bodyStr = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', CENTRIFUGO_WEBHOOK_SECRET).update(bodyStr).digest('hex');
  return {
    bodyStr,
    headers: {
      'Content-Type': 'application/json',
      'x-centrifugo-signature': sig,
    },
  };
}

describe('Security & Authorization Audit Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let customerToken: string;

  beforeAll(async () => {
    adminToken = await getAdminToken();
    operatorToken = await getOtpToken(OPERATOR_PHONE);
    customerToken = await getOtpToken(CUSTOMER_PHONE);
  }, 40000);

  // ── 1. Centrifugo Proxy Subscription Authorization & Webhook Security ────────
  describe('1. Centrifugo Proxy Subscription Authorization & Webhook Security', () => {
    it('should reject unsigned webhook with 401 Unauthorized (Fail-Closed)', async () => {
      try {
        await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', {
          user: '00000000-0000-0000-0000-000000000001',
          channel: 'chat:room#00000000-0000-0000-0000-999999999999',
        });
        fail('Unsigned webhook request must be rejected with 401');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });

    it('should reject webhook with invalid signature (401 Unauthorized)', async () => {
      try {
        await axios.post(
          'http://localhost:3002/webhooks/centrifugo/subscribe',
          { user: '00000000-0000-0000-0000-000000000001', channel: 'chat:room#00000000-0000-0000-0000-999999999999' },
          { headers: { 'Content-Type': 'application/json', 'x-centrifugo-signature': 'bad_signature_hex' } },
        );
        fail('Invalid signature must be rejected with 401');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });

    it('should deny unauthorized room subscription via validly signed webhook', async () => {
      const payload = {
        user: '00000000-0000-0000-0000-000000000001',
        channel: 'chat:room#00000000-0000-0000-0000-999999999999',
      };
      const signed = signCentrifugo(payload);
      const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', signed.bodyStr, {
        headers: signed.headers,
      });
      expect(res.data.error).toBeDefined();
      expect([1000, 1003, 1004]).toContain(res.data.error.code);
    });

    it('should reject malformed non-UUID room in webhook gracefully (code 1004, not 500)', async () => {
      const payload = {
        user: '00000000-0000-0000-0000-000000000001',
        channel: 'chat:room#not-a-valid-uuid-format',
      };
      const signed = signCentrifugo(payload);
      const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', signed.bodyStr, {
        headers: signed.headers,
      });
      expect(res.status).toBe(200);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe(1004);
    });

    it('should deny unhandled/unknown channel via webhook (code 1000 default-deny)', async () => {
      const payload = {
        user: '00000000-0000-0000-0000-000000000001',
        channel: 'random:unhandled:channel#123',
      };
      const signed = signCentrifugo(payload);
      const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', signed.bodyStr, {
        headers: signed.headers,
      });
      expect(res.status).toBe(200);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe(1000);
    });

    it('should deny cross-user notification channel subscription via signed webhook', async () => {
      const payload = {
        user: '00000000-0000-0000-0000-000000000001',
        channel: 'chat:user#00000000-0000-0000-0000-000000000002',
      };
      const signed = signCentrifugo(payload);
      const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', signed.bodyStr, {
        headers: signed.headers,
      });
      expect(res.data.error).toBeDefined();
    });

    it('should deny non-staff access to presence:operators via signed webhook', async () => {
      const payload = {
        user: '00000000-0000-0000-0000-000000000001',
        channel: 'presence:operators',
      };
      const signed = signCentrifugo(payload);
      const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', signed.bodyStr, {
        headers: signed.headers,
      });
      expect(res.data.error).toBeDefined();
    });

    it('should reject unsigned presence webhook (401 Unauthorized)', async () => {
      try {
        await axios.post('http://localhost:3003/webhooks/centrifugo/connect', {
          user: '00000000-0000-0000-0000-000000000001',
          client: 'test-client',
        });
        fail('Unsigned presence webhook must be rejected with 401');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });
  });

  // ── 1b. Centrifugo Subscription Token Authorization ──────────────────────────
  describe('1b. Centrifugo Subscription Token Authorization (POST /auth/centrifugo/subscribe)', () => {
    it('should reject subscription token for unauthorized room', async () => {
      try {
        await axios.post(
          `${API}/auth/centrifugo/subscribe`,
          { channel: 'chat:room#00000000-0000-0000-0000-999999999999' },
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Should have rejected subscription token for unauthorized room');
      } catch (err: any) {
        expect([403, 404]).toContain(err.response?.status);
      }
    });

    it('should reject subscription token with invalid UUID format (400 Bad Request)', async () => {
      try {
        await axios.post(
          `${API}/auth/centrifugo/subscribe`,
          { channel: 'chat:room#invalid-uuid' },
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Should have returned 400 for invalid UUID');
      } catch (err: any) {
        expect(err.response?.status).toBe(400);
      }
    });

    it('should reject subscription token for presence:operators for customer (403 Forbidden)', async () => {
      try {
        await axios.post(
          `${API}/auth/centrifugo/subscribe`,
          { channel: 'presence:operators' },
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Should have returned 403 for presence:operators');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });
  });

  // ── 2. Nova SSO Signature Verification & Legacy Branch Elimination ───────────
  describe('2. Nova SSO Signature Verification (Audit Item 1)', () => {
    it('should reject invalid SSO signature (401 Unauthorized)', async () => {
      try {
        await axios.post(`${API}/auth/nova/sso`, {
          novaUserId: '123',
          timestamp: Math.floor(Date.now() / 1000),
          novaRole: 'operator',
          fullName: 'Test Operator',
          signature: 'invalid_signature_hex',
        });
        fail('Should have thrown UnauthorizedException');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });

    it('should REJECT legacy signature over novaUserId:timestamp (Item 1: unsigned role vulnerability)', async () => {
      const novaUserId = 'sso-user-test-1';
      const timestamp = Math.floor(Date.now() / 1000);
      // Legacy format did NOT sign novaRole
      const legacySig = crypto
        .createHmac('sha256', NOVA_SSO_SECRET)
        .update(`${novaUserId}:${timestamp}`)
        .digest('hex');

      try {
        await axios.post(`${API}/auth/nova/sso`, {
          novaUserId,
          timestamp,
          novaRole: 'admin', // attacker trying to elevate to admin using legacy signature
          fullName: 'Legacy Exploit Tester',
          signature: legacySig,
        });
        fail('Legacy signature omitting novaRole must be rejected with 401');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });

    it('should accept valid signature over novaUserId:timestamp:novaRole:locale', async () => {
      const novaUserId = `sso-${Date.now()}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const novaRole = 'operator';
      const locale = 'uz';
      const validSig = crypto
        .createHmac('sha256', NOVA_SSO_SECRET)
        .update(`${novaUserId}:${timestamp}:${novaRole}:${locale}`)
        .digest('hex');

      const res = await axios.post(`${API}/auth/nova/sso`, {
        novaUserId,
        timestamp,
        novaRole,
        fullName: 'Valid SSO Operator',
        locale,
        signature: validSig,
      });
      expect([200, 201]).toContain(res.status);
      expect(res.data.accessToken).toBeDefined();
    });

    it('should reject tampered role when signature was made for a different role', async () => {
      const novaUserId = `sso-tamper-${Date.now()}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const sigForCustomer = crypto
        .createHmac('sha256', NOVA_SSO_SECRET)
        .update(`${novaUserId}:${timestamp}:customer:uz`)
        .digest('hex');

      try {
        await axios.post(`${API}/auth/nova/sso`, {
          novaUserId,
          timestamp,
          novaRole: 'admin', // tampered
          fullName: 'Tamper Tester',
          locale: 'uz',
          signature: sigForCustomer,
        });
        fail('Tampered role signature must be rejected');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });
  });

  // ── 3. Operator Product Switching Authorization ──────────────────────────────
  describe('3. Operator Product Switching Authorization', () => {
    it('should reject switching to an unauthorized product', async () => {
      try {
        await axios.patch(
          `${API}/operator/product`,
          { productId: '99999999-9999-9999-9999-999999999999' },
          { headers: { Authorization: `Bearer ${operatorToken}` } },
        );
        fail('Should have rejected unauthorized product');
      } catch (err: any) {
        expect([403, 404]).toContain(err.response?.status);
      }
    });
  });

  // ── 4. Telephony & Call Authorization (Audit Items 4, 5, 6, 7) ────────────────
  describe('4. Telephony & Call Authorization (Audit Items 4, 5, 6, 7)', () => {
    const fakeCallId = '00000000-0000-0000-0000-999999999999';

    it('should reject call queue access for customer (403 Forbidden)', async () => {
      try {
        await axios.get(`${API}/calls/queue`, {
          headers: { Authorization: `Bearer ${customerToken}` },
        });
        fail('Should have rejected queue access for customer');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });

    it('should reject customer trying to mute a non-participant call (403 or 404)', async () => {
      try {
        await axios.post(
          `${API}/calls/${fakeCallId}/mute`,
          { muted: true },
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Customer must not be allowed to mute calls without participation');
      } catch (err: any) {
        expect([403, 404]).toContain(err.response?.status);
      }
    });

    it('should reject customer trying to complete warm transfer (403 Forbidden)', async () => {
      try {
        await axios.post(
          `${API}/calls/${fakeCallId}/transfer/complete`,
          {},
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Customer must not be allowed to complete warm transfer');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });

    it('should reject customer trying to ack recording consent (403 Forbidden)', async () => {
      try {
        await axios.post(
          `${API}/calls/${VALID_UUID_V4}/recording/consent-ack`,
          { recordingId: VALID_UUID_V4 },
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Customer must not be allowed to ack recording consent');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });

    it('should reject customer trying to stop call recording (403 Forbidden)', async () => {
      try {
        await axios.post(
          `${API}/calls/${fakeCallId}/recording/stop`,
          {},
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Customer must not be allowed to stop recording');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });
  });

  // ── 5. Admin RBAC & Privilege Escalation Prevention (SEC-01) ─────────────────
  describe('5. Admin RBAC & Privilege Escalation Prevention (SEC-01)', () => {
    let supervisorToken: string;
    let supervisorUserId: string;

    beforeAll(async () => {
      const email = `supervisor-${Date.now()}@pusher.uz`;
      const pass = 'SupervisorPass123!';
      const createRes = await axios.post(
        `${API}/admin/users`,
        {
          email,
          password: pass,
          firstName: 'Audit',
          lastName: 'Supervisor',
          role: 'supervisor',
          productIds: [],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      supervisorUserId = createRes.data.id;
      const loginRes = await axios.post(`${API}/auth/email-login`, { email, password: pass });
      supervisorToken = loginRes.data.accessToken;
      expect(supervisorToken).toBeTruthy();
    }, 30000);

    it('should reject supervisor trying to create new users (403 Forbidden)', async () => {
      try {
        await axios.post(
          `${API}/admin/users`,
          {
            email: `hacked-${Date.now()}@pusher.uz`,
            password: 'Password123!',
            firstName: 'Hacked',
            lastName: 'User',
            role: 'admin',
          },
          { headers: { Authorization: `Bearer ${supervisorToken}` } },
        );
        fail('Supervisor should NOT be able to create users');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });

    it('should reject supervisor trying to change passwords (403 Forbidden)', async () => {
      try {
        await axios.patch(
          `${API}/admin/users/${supervisorUserId}/password`,
          { password: 'NewPassword123!' },
          { headers: { Authorization: `Bearer ${supervisorToken}` } },
        );
        fail('Supervisor should NOT be able to change passwords');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });

    it('should reject supervisor trying to delete users (403 Forbidden)', async () => {
      try {
        await axios.delete(
          `${API}/admin/users/${supervisorUserId}`,
          { headers: { Authorization: `Bearer ${supervisorToken}` } },
        );
        fail('Supervisor should NOT be able to delete users');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });
  });

  // ── 6. Token Revocation upon User Deletion / Suspension (SEC-03) ──────────────
  describe('6. Token Revocation upon User Deletion / Suspension (SEC-03)', () => {
    it('should immediately reject deleted user token with 401 Unauthorized', async () => {
      const email = `disposable-${Date.now()}@pusher.uz`;
      const pass = 'DispPass123!';
      const createRes = await axios.post(
        `${API}/admin/users`,
        {
          email,
          password: pass,
          firstName: 'Disposable',
          lastName: 'Operator',
          role: 'operator',
          productIds: [],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      const userId = createRes.data.id;

      const loginRes = await axios.post(`${API}/auth/email-login`, {
        email,
        password: pass,
      });
      const token = loginRes.data.accessToken;

      const meRes = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(meRes.status).toBe(200);

      const deleteRes = await axios.delete(`${API}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(deleteRes.status).toBe(200);

      try {
        await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        fail('Deleted user token must be rejected');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });
  });

  // ── 7. Email Login Brute-Force Rate Limiting (SEC-04) ─────────────────────────
  describe('7. Email Login Brute-Force Rate Limiting (SEC-04)', () => {
    it('should return 429 Too Many Requests after 5 consecutive failed logins', async () => {
      const email = `victim-${Date.now()}@pusher.uz`;
      for (let i = 0; i < 5; i++) {
        try {
          await axios.post(`${API}/auth/email-login`, {
            email,
            password: `WrongPass${i}!`,
          });
        } catch (err: any) {
          expect(err.response?.status).toBe(401);
        }
      }

      try {
        await axios.post(`${API}/auth/email-login`, {
          email,
          password: 'WrongPassAgain!',
        });
        fail('Should have failed with 429 Too Many Requests');
      } catch (err: any) {
        expect(err.response?.status).toBe(429);
      }
    });
  });

  // ── 8. Presence Bulk Endpoint Zero-Trust (Audit Item 15) ─────────────────────
  describe('8. Presence Bulk Endpoint Zero-Trust (Audit Item 15)', () => {
    it('should reject bulk presence lookup for customer (403 Forbidden)', async () => {
      try {
        await axios.post(
          `${API}/presence/users/bulk`,
          { ids: [VALID_UUID_V4] },
          { headers: { Authorization: `Bearer ${customerToken}` } },
        );
        fail('Customer must not be allowed to perform bulk presence checks');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });

    it('should allow bulk presence lookup for staff (200 OK)', async () => {
      const res = await axios.post(
        `${API}/presence/users/bulk`,
        { ids: [VALID_UUID_V4] },
        { headers: { Authorization: `Bearer ${operatorToken}` } },
      );
      expect([200, 201]).toContain(res.status);
      expect(res.data.users).toBeDefined();
    });
  });

  // ── 9. Session Logout & Access Token Blacklisting (Audit Item 10) ────────────
  describe('9. Session Logout & Access Token Blacklisting (Audit Item 10)', () => {
    it('should invalidate access token immediately upon logout', async () => {
      const email = `logout-test-${Date.now()}@pusher.uz`;
      const pass = 'LogoutPass123!';
      await axios.post(
        `${API}/admin/users`,
        {
          email,
          password: pass,
          firstName: 'Logout',
          lastName: 'Tester',
          role: 'operator',
          productIds: [],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );

      const loginRes = await axios.post(`${API}/auth/email-login`, { email, password: pass });
      const { accessToken, refreshToken } = loginRes.data;

      // Verify active session works
      const beforeLogout = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(beforeLogout.status).toBe(200);

      // Perform logout
      const logoutRes = await axios.post(
        `${API}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      expect([200, 201]).toContain(logoutRes.status);

      // Try calling /auth/me with blacklisted access token
      try {
        await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        fail('Blacklisted access token must be rejected with 401');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }

      // Try refreshing with the old refresh token
      try {
        await axios.post(`${API}/auth/refresh`, { refreshToken });
        fail('Revoked refresh token must be rejected with 401');
      } catch (err: any) {
        expect(err.response?.status).toBe(401);
      }
    });
  });
});
