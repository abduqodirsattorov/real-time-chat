/**
 * Auth Service integration tests
 * Run: BASE_URL=http://localhost:80/api/v1 npx jest tests/integration/auth.test.ts
 */
import axios from 'axios';

const BASE = process.env.BASE_URL ?? 'http://localhost:80/api/v1';
const http = axios.create({ baseURL: BASE, validateStatus: () => true });

const REGISTER_PHONE = '+998909999881';
const LOGIN_PHONE = '+998909999882';
const VERIFY_PHONE = '+998909999883';
const ME_PHONE = '+998909999884';

describe('Auth Service', () => {
  let accessToken: string;
  let refreshToken: string;
  let otp: string;

  describe('POST /auth/register', () => {
    it('registers new user', async () => {
      const res = await http.post('/auth/register', { phone: REGISTER_PHONE, fullName: 'Test User' });
      expect([200, 201, 409]).toContain(res.status);
    });
  });

  describe('POST /auth/login (OTP send)', () => {
    it('sends OTP', async () => {
      await http.post('/auth/register', { phone: LOGIN_PHONE, fullName: 'Login User' });
      const res = await http.post('/auth/login', { phone: LOGIN_PHONE });
      expect([200, 400]).toContain(res.status); // 200 or rate limited 400
      expect(res.data.message).toBeTruthy();
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('returns 401 for wrong OTP', async () => {
      await http.post('/auth/register', { phone: VERIFY_PHONE, fullName: 'Verify User' });
      const res = await http.post('/auth/otp/verify', { phone: VERIFY_PHONE, otp: '000000' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me (with token)', () => {
    beforeAll(async () => {
      await http.post('/auth/register', { phone: ME_PHONE, fullName: 'Me User' });
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
