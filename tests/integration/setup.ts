/**
 * Test setup helpers — token acquisition for integration tests.
 *
 * Admin token:    email login (known credentials, no OTP needed)
 * Customer/Operator token: OTP login — OTP read directly from Redis
 *                 (services must be running: docker compose up -d)
 */
import axios from 'axios';
import { execSync } from 'child_process';

export const BASE = process.env.BASE_URL ?? 'http://localhost:80/api/v1';
export const PROJECT_DIR =
  process.env.PROJECT_DIR ?? 'C:\\Users\\abduq\\OneDrive\\Documents\\real-time-chat';

export const DEFAULT_PRODUCT_ID = '00000000-0000-0000-0000-000000000002';
export const ADMIN_EMAIL = 'admin@pusher.uz';
export const ADMIN_PASSWORD = 'Admin12345';
export const OPERATOR_PHONE = '+998900000002';
export const CUSTOMER_PHONE = '+998900000001';

/** GET JWT via email+password login */
export async function getAdminToken(): Promise<string> {
  const res = await axios.post(
    `${BASE}/auth/email-login`,
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { validateStatus: () => true },
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Admin login failed ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data.accessToken;
}

/**
 * GET JWT via OTP login.
 * Sends OTP request, then reads the OTP directly from Redis
 * (auth-service stores it as auth:otp:<phone> with TTL 300s).
 */
export async function getOtpToken(phone: string): Promise<string> {
  const http = axios.create({ baseURL: BASE, validateStatus: () => true });

  // 1. Trigger OTP
  const sendRes = await http.post('/auth/login', { phone });
  if (sendRes.status !== 200) {
    throw new Error(`OTP send failed ${sendRes.status}: ${JSON.stringify(sendRes.data)}`);
  }

  // 2. Read OTP from Redis
  let otp: string;
  try {
    otp = execSync(
      `docker compose exec -T redis redis-cli get "auth:otp:${phone}"`,
      { cwd: PROJECT_DIR, timeout: 10000 },
    )
      .toString()
      .trim();
  } catch (e: any) {
    throw new Error(`Redis OTP read failed: ${e.message}`);
  }

  if (!otp || !/^\d{6}$/.test(otp)) {
    throw new Error(`Invalid OTP from Redis: "${otp}" — is auth-service running?`);
  }

  // 3. Verify OTP
  const verifyRes = await http.post('/auth/otp/verify', { phone, otp });
  if (verifyRes.status !== 200 && verifyRes.status !== 201) {
    throw new Error(`OTP verify failed ${verifyRes.status}: ${JSON.stringify(verifyRes.data)}`);
  }
  return verifyRes.data.accessToken;
}

/** Axios instance pre-configured with a Bearer token and optional product header */
export function makeHttp(token: string, productId?: string) {
  return axios.create({
    baseURL: BASE,
    validateStatus: () => true,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(productId ? { 'X-Product-Id': productId } : {}),
    },
  });
}
