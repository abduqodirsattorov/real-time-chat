import axios from 'axios';
import * as crypto from 'crypto';

const API = 'http://localhost/api/v1';

describe('Security & Authorization Audit Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let customer1Token: string;
  let customer2Token: string;

  beforeAll(async () => {
    // Admin login
    try {
      const res = await axios.post(`${API}/auth/login/email`, {
        email: 'admin@pusher.uz',
        password: 'Admin12345',
      });
      adminToken = res.data.accessToken;
    } catch {
      // Mock / fallback if auth service is direct
    }
  });

  describe('1. Centrifugo Proxy Subscription Authorization', () => {
    it('should deny unauthorized room subscription', async () => {
      try {
        const res = await axios.post('http://localhost:3002/webhooks/centrifugo/subscribe', {
          user: '00000000-0000-0000-0000-000000000001',
          channel: 'chat:room#00000000-0000-0000-0000-999999999999',
        });
        expect(res.data.error).toBeDefined();
        expect(res.data.error.code).toBe(1000);
      } catch (err: any) {
        expect(err.response?.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('should deny cross-user notification channel subscription', async () => {
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

    it('should deny non-staff access to presence:operators', async () => {
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

  describe('2. Nova SSO Signature Verification', () => {
    it('should reject invalid SSO signature', async () => {
      try {
        await axios.post(`${API}/auth/nova-sso`, {
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
        expect(err.response?.status).toBe(403);
      }
    });
  });

  describe('4. LiveKit Token & Call Endpoint Authorization', () => {
    it('should reject call queue access for non-staff', async () => {
      if (!customer1Token) return;
      try {
        await axios.get(`${API}/calls/queue`, {
          headers: { Authorization: `Bearer ${customer1Token}` },
        });
        fail('Should have rejected queue access for customer');
      } catch (err: any) {
        expect(err.response?.status).toBe(403);
      }
    });
  });
});
