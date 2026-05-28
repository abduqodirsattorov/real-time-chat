import { api } from './client';

export interface LoginStep1Res {
  sessionId: string;
}

export interface LoginStep2Res {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    fullName: string;
    role: string;
  };
}

export const authApi = {
  sendOtp(phone: string): Promise<LoginStep1Res> {
    return api.post('/auth/login', { phone }).then((r) => r.data);
  },

  verifyOtp(sessionId: string, code: string): Promise<LoginStep2Res> {
    return api.post('/auth/verify', { sessionId, code }).then((r) => r.data);
  },

  me() {
    return api.get('/auth/me').then((r) => r.data);
  },

  logout(refreshToken: string) {
    return api.post('/auth/logout', { refreshToken });
  },

  centrifugoToken() {
    return api.post('/auth/centrifugo/token').then((r) => r.data as { token: string });
  },

  centrifugoSubscribeToken(channel: string) {
    return api
      .post('/auth/centrifugo/subscribe-token', { channel })
      .then((r) => r.data as { token: string });
  },
};
