import { api } from './client';

export interface LoginRes {
  message: string;
  ttl: number;
}

export interface VerifyRes {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface MeRes {
  id: string;
  phone?: string;
  email?: string;
  fullName: string;
  role: string;
}

export const authApi = {
  /** Step 1: telefon raqam yuborish — OTP chiqariladi (auth-service logda ko'rinadi) */
  sendOtp(phone: string): Promise<LoginRes> {
    return api.post('/auth/login', { phone }).then((r) => r.data);
  },

  /** Email + parol bilan login (operator/admin) */
  emailLogin(email: string, password: string): Promise<VerifyRes> {
    return api.post('/auth/email-login', { email, password }).then((r) => r.data);
  },

  /** Step 2: POST /auth/otp/verify { phone, otp } → tokens */
  verifyOtp(phone: string, otp: string): Promise<VerifyRes> {
    return api.post('/auth/otp/verify', { phone, otp }).then((r) => r.data);
  },

  me(): Promise<MeRes> {
    return api.get('/auth/me').then((r) => r.data);
  },

  logout() {
    return api.post('/auth/logout');
  },

  centrifugoToken() {
    return api.post('/auth/centrifugo/token').then((r) => r.data as { token: string });
  },

  centrifugoSubscribeToken(channel: string) {
    return api
      .post('/auth/centrifugo/subscribe', { channel })
      .then((r) => r.data as { token: string });
  },
};
