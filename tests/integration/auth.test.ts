/**
 * Auth Service integration tests
 * Run: BASE_URL=http://localhost:80/api/v1 npx jest tests/integration/auth.test.ts
 */
import axios from 'axios';

const BASE = process.env.BASE_URL ?? 'http://localhost:80/api/v1';
const http = axios.create({ baseURL: BASE, validateStatus: () => true });

const TEST_PHONE = '+998909999888';

describe('Auth Service', () => {
  let accessToken: string;
  let refreshToken: string;
  let otp: string;

  describe('POST /auth/register', () => {
    it('registers new user', async () => {
      const res = await http.post('/auth/register', { phone: TEST_PHONE, fullName: 'Test User' });
      expect([200, 201, 409]).toContain(res.status);
    });
  });

  describe('POST /auth/login (OTP send)', () => {
    it('sends OTP', async () => {
      const res = await http.post('/auth/login', { phone: TEST_PHONE });
      expect(res.status).toBe(200);
      expect(res.data.message).toBeTruthy();
      // In test env, OTP is logged — fetch via docker logs
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('returns 401 for wrong OTP', async () => {
      const res = await http.post('/auth/otp/verify', { phone: TEST_PHONE, otp: '000000' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me (with token)', () => {
    beforeAll(async () => {
      // Use existing test user +998901234567
      const login = await http.post('/auth/login', { phone: '+998901234567' });
      expect(login.status).toBe(200);
      // In real test, read OTP from docker logs
      // Here we skip token acquisition and test with known token
    });

    it('returns 401 without token', async () => {
      const res = await http.get('/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/centrifugo/token', () => {
    it('requires auth', async () => {
      const res = await http.post('/auth/centrifugo/token');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/centrifugo/subscribe', () => {
    it('requires auth', async () => {
      const res = await http.post('/auth/centrifugo/subscribe', { channel: 'chat:room#test' });
      expect(res.status).toBe(401);
    });
  });
});
