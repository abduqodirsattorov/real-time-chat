import axios from 'axios';
import * as crypto from 'crypto';
import { BASE, getAdminToken, getOtpToken, CUSTOMER_PHONE, OPERATOR_PHONE } from './setup';

const API = BASE;

describe('Security & Authorization Audit Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let customerToken: string;

  // Token olinmasa testlar JIMGINA o'tib ketmasligi kerak — setup xatosi
  // butun to'plamni yiqitadi, chunki tokensiz hech qanday tekshiruv haqiqiy emas.
  beforeAll(async () => {
    adminToken = await getAdminToken();
    operatorToken = adminToken;
    customerToken = await getOtpToken(CUSTOMER_PHONE);
  }, 40000);

  describe('1. Centrifugo Proxy Subscription Authorization', () => {
    it('should deny unauthorized room subscription via webhook', async () => {
      try {
        const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', {
          user: '00000000-0000-0000-0000-000000000001',
          channel: 'chat:room#00000000-0000-0000-0000-999999999999',
        });
        expect(res.data.error).toBeDefined();
        expect([1000, 1003, 1004]).toContain(res.data.error.code);
      } catch (err: any) {
        if (err.response) {
          expect(err.response.status).toBeGreaterThanOrEqual(400);
        } else {
          throw err;
        }
      }
    });

    it('should reject malformed non-UUID room in webhook gracefully (code 1004, not 500)', async () => {
      const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', {
        user: '00000000-0000-0000-0000-000000000001',
        channel: 'chat:room#not-a-valid-uuid-format',
      });
      expect(res.status).toBe(200);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe(1004);
    });

    it('should deny cross-user notification channel subscription via webhook', async () => {
      try {
        const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', {
          user: '00000000-0000-0000-0000-000000000001',
          channel: 'chat:user#00000000-0000-0000-0000-000000000002',
        });
        expect(res.data.error).toBeDefined();
      } catch (err: any) {
        expect(err.response?.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('should deny non-staff access to presence:operators via webhook', async () => {
      try {
        const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', {
          user: '00000000-0000-0000-0000-000000000001',
          channel: 'presence:operators',
        });
        expect(res.data.error).toBeDefined();
      } catch (err: any) {
        expect(err.response?.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

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

  describe('2. Nova SSO Signature Verification', () => {
    it('should reject invalid SSO signature', async () => {
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
  });

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

  describe('4. LiveKit Token & Call Endpoint Authorization', () => {
    it('should reject call queue access for non-staff', async () => {
      try {
        await axios.get(`${API}/calls/queue`, {
          headers: { Authorization: `Bearer ${customerToken}` },
        });
        fail('Should have rejected queue access for customer');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });
  });

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
});
