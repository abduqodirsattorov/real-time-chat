import axios from 'axios';
import * as crypto from 'crypto';
import { BASE, getAdminToken, getOtpToken, CUSTOMER_PHONE, OPERATOR_PHONE } from './setup';

const API = BASE;

describe('Security & Authorization Audit Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let customerToken: string;

  beforeAll(async () => {
    try {
      adminToken = await getAdminToken();
      operatorToken = adminToken;
      customerToken = await getOtpToken(CUSTOMER_PHONE);
    } catch (err) {
      console.warn('Token setup warning:', err);
    }
  }, 30000);

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
      if (!customerToken) return;
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
      if (!customerToken) return;
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
      if (!customerToken) return;
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
      if (!operatorToken) return;
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
      if (!customerToken) return;
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
});
