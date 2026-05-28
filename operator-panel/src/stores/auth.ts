import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type LoginStep2Res } from '@/api/auth';
import { useCentrifugeStore } from './centrifuge';
import { usePresenceStore } from './presence';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('access_token'));
  const refreshToken = ref<string | null>(localStorage.getItem('refresh_token'));
  const user = ref<LoginStep2Res['user'] | null>(null);

  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'supervisor');

  function setTokens(access: string, refresh: string) {
    token.value = access;
    refreshToken.value = refresh;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }

  async function afterLogin(data: LoginStep2Res) {
    setTokens(data.accessToken, data.refreshToken);
    user.value = data.user;

    const centrifuge = useCentrifugeStore();
    await centrifuge.connect();

    const presence = usePresenceStore();
    await presence.setStatus('available');
  }

  async function loadMe() {
    try {
      user.value = await authApi.me();
    } catch {
      await logout();
    }
  }

  async function logout() {
    if (refreshToken.value) {
      try { await authApi.logout(refreshToken.value); } catch { /* ignore */ }
    }
    const centrifuge = useCentrifugeStore();
    centrifuge.disconnect();

    token.value = null;
    refreshToken.value = null;
    user.value = null;
    localStorage.clear();
  }

  return { token, user, isAdmin, afterLogin, loadMe, logout };
});
