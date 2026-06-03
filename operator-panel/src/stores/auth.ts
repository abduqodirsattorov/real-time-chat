import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type VerifyRes, type MeRes } from '@/api/auth';
import { useCentrifugeStore } from './centrifuge';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('access_token'));
  const refreshToken = ref<string | null>(localStorage.getItem('refresh_token'));
  const user = ref<MeRes | null>(null);

  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'supervisor');

  function setTokens(access: string, refresh: string) {
    token.value = access;
    refreshToken.value = refresh;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }

  async function loginWithEmail(email: string, password: string) {
    const data = await authApi.emailLogin(email, password);
    await afterLogin(data);
  }

  async function afterLogin(data: VerifyRes) {
    setTokens(data.accessToken, data.refreshToken);
    await loadMe();

    const centrifuge = useCentrifugeStore();
    await centrifuge.connect();
    // NOTE: setStatus('available') is called in ProductPickerView after product selection
  }

  async function loadMe() {
    try {
      user.value = await authApi.me();
    } catch {
      await logout();
    }
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    const centrifuge = useCentrifugeStore();
    centrifuge.disconnect();

    token.value = null;
    refreshToken.value = null;
    user.value = null;
    localStorage.clear();
  }

  return { token, user, isAdmin, loginWithEmail, afterLogin, loadMe, logout };
});
