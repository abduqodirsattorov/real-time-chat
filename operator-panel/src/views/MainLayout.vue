<template>
  <div class="app-shell">

    <!-- ── Nav Rail (70px) ── -->
    <nav class="nav-rail">
      <!-- Logo -->
      <div class="nav-logo">
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="10" fill="url(#nlg)" />
          <path d="M10 13h16M10 18h10M10 23h13" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
          <defs>
            <linearGradient id="nlg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop stop-color="#5B9BF5"/><stop offset="1" stop-color="#7B6FF4"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <!-- Nav icons -->
      <div class="nav-icons">
        <router-link to="/chat" class="nav-icon" :class="{ active: $route.path.startsWith('/chat') }" :title="t('chat.noRoom')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span v-if="rooms.totalUnread > 0" class="nav-badge">{{ rooms.totalUnread > 99 ? '99+' : rooms.totalUnread }}</span>
        </router-link>

        <router-link to="/calls" class="nav-icon" :class="{ active: $route.path.startsWith('/calls') }" :title="t('calls.history')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </router-link>

        <button class="nav-icon" :title="t('common.loading')" @click="showSearch = !showSearch">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </button>

        <router-link
          v-if="auth.isAdmin"
          to="/admin/users"
          class="nav-icon"
          :class="{ active: $route.path.startsWith('/admin') }"
          :title="t('admin.users')"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </router-link>
      </div>

      <!-- Bottom: status + avatar -->
      <div class="nav-bottom">
        <div class="nav-avatar-wrap" @click="showAvatarMenu = !showAvatarMenu" ref="avatarRef">
          <div class="nav-avatar" :style="avatarStyle">{{ userInitials }}</div>
          <span class="status-dot" :class="presenceStore.status" />
        </div>
      </div>
    </nav>

    <!-- ── Avatar popup ── -->
    <Teleport to="body">
      <div v-if="showAvatarMenu" class="avatar-menu-overlay" @click="showAvatarMenu = false">
        <div class="avatar-menu" :style="avatarMenuStyle" @click.stop>
          <div class="avatar-menu-user">
            <div class="avatar-menu-avatar" :style="avatarStyle">{{ userInitials }}</div>
            <div>
              <div class="avatar-menu-name">{{ auth.user?.fullName ?? auth.user?.phone }}</div>
              <div class="avatar-menu-role">{{ auth.user?.role }}</div>
            </div>
          </div>
          <div class="avatar-menu-divider" />
          <!-- Status options -->
          <button v-for="s in statuses" :key="s.value"
            class="avatar-menu-item"
            :class="{ active: presenceStore.status === s.value }"
            @click="setStatus(s.value)">
            <span class="status-dot-sm" :class="s.value" />
            {{ t(`presence.${s.value}`) }}
          </button>
          <div class="avatar-menu-divider" />
          <button class="avatar-menu-item logout" @click="confirmLogout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            {{ t('common.logout') }}
          </button>
        </div>
      </div>

      <!-- Logout confirm modal -->
      <div v-if="showLogoutModal" class="modal-backdrop" @click.self="showLogoutModal = false">
        <div class="modal-box">
          <h3>{{ t('common.logout') }}</h3>
          <p>Akkauntdan rostan ham chiqib ketmoqchimisiz?</p>
          <div class="modal-actions">
            <button class="modal-cancel" @click="showLogoutModal = false">Bekor qilish</button>
            <button class="modal-confirm" @click="doLogout">Chiqish</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Main content ── -->
    <main class="app-content">
      <router-view />
    </main>

    <!-- ── Overlays (call modals etc) ── -->
    <!-- IncomingCallModal is rendered inside RoomList, not here -->
    <!-- InCallPanel: only the bottom action bar -->
    <InCallPanel v-if="calls.activeCall" />
    <SearchPanel v-if="showSearch" @close="showSearch = false" />
    <CallQueuePanel />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCallsStore } from '@/stores/calls';
import { useCentrifugeStore } from '@/stores/centrifuge';
import { usePresenceStore } from '@/stores/presence';
import { useRoomsStore } from '@/stores/rooms';
import type { OperatorStatus } from '@/api/presence';
import IncomingCallModal from '@/components/IncomingCallModal.vue';
import InCallPanel from '@/components/InCallPanel.vue';
import SearchPanel from '@/components/SearchPanel.vue';
import CallQueuePanel from '@/components/CallQueuePanel.vue';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const calls = useCallsStore();
const centrifuge = useCentrifugeStore();
const presenceStore = usePresenceStore();
const rooms = useRoomsStore();

const showSearch = ref(false);
const showAvatarMenu = ref(false);
const showLogoutModal = ref(false);
const avatarRef = ref<HTMLElement | null>(null);

const statuses: { value: OperatorStatus }[] = [
  { value: 'available' },
  { value: 'busy' },
  { value: 'away' },
  { value: 'offline' },
];

const userInitials = computed(() => {
  const name = auth.user?.fullName ?? auth.user?.phone ?? '';
  return name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || 'OP';
});

const avatarColors = ['#D1E8FF', '#D4F7E8', '#EDE8FF', '#FFE8D6', '#FFE8E8'];
const avatarStyle = computed(() => {
  const idx = (auth.user?.id?.charCodeAt(0) ?? 0) % avatarColors.length;
  return { background: avatarColors[idx] };
});

const avatarMenuStyle = computed(() => ({
  bottom: '80px',
  left: '76px',
}));

async function setStatus(s: OperatorStatus) {
  await presenceStore.setStatus(s);
  showAvatarMenu.value = false;
}

function confirmLogout() {
  showAvatarMenu.value = false;
  showLogoutModal.value = true;
}

async function doLogout() {
  showLogoutModal.value = false;
  await auth.logout();
  router.push('/login');
}

function setOfflineBeacon() {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  // keepalive: true — page yopilayotganda ham so'rov tugallashini kafolatlaydi
  fetch('/api/v1/operator/status', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'offline' }),
    keepalive: true,
  }).catch(() => {});
}

onMounted(async () => {
  if (!auth.user) await auth.loadMe();

  window.addEventListener('beforeunload', setOfflineBeacon);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') setOfflineBeacon();
  });

  if (auth.user) {
    await centrifuge.subscribe(`chat:user#${auth.user.id}`, (raw) => {
      const payload = raw as {
        event: string;
        callId?: string;
        callerId?: string;
        livekitRoom?: string;
        ts?: string;
        call?: Parameters<typeof calls.setIncomingCall>[0];
      };
      if (payload.event === 'call.incoming') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification("Nova Chat — Kiruvchi qo'ng'iroq", { body: "Mijozdan qo'ng'iroq keldi", icon: '/favicon.ico' }); } catch { /* */ }
        }
        const callObj = payload.call ?? {
          id: payload.callId!,
          callerId: payload.callerId ?? '',
          calleeId: auth.user!.id,
          status: 'ringing',
          direction: 'inbound',
          livekitRoom: payload.livekitRoom ?? '',
          startedAt: null,
          endedAt: null,
        };
        calls.setIncomingCall(callObj as Parameters<typeof calls.setIncomingCall>[0]);
      }
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', setOfflineBeacon);
  setOfflineBeacon();
});
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--c-bg);
}

/* ── Nav Rail ── */
.nav-rail {
  width: var(--nav-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  border-right: 1px solid var(--c-border);
  background: var(--c-bg);
  gap: 8px;
}

.nav-logo {
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}

.nav-icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.nav-icon {
  position: relative;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--r-md);
  border: none;
  background: transparent;
  color: var(--c-text-2);
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.nav-icon:hover { background: var(--c-surface); color: var(--c-text); }
.nav-icon.active { background: var(--c-accent-bg); color: var(--c-accent); }

.nav-badge {
  position: absolute;
  top: 4px; right: 4px;
  background: var(--c-red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--r-full);
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
  line-height: 14px;
}

/* Avatar at bottom */
.nav-bottom { margin-top: auto; }

.nav-avatar-wrap {
  position: relative;
  cursor: pointer;
  width: 40px; height: 40px;
}

.nav-avatar {
  width: 40px; height: 40px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #444;
  border: 2px solid var(--c-border);
  transition: border-color 0.15s;
}

.nav-avatar-wrap:hover .nav-avatar { border-color: var(--c-accent); }

.status-dot {
  position: absolute;
  bottom: 1px; right: 1px;
  width: 10px; height: 10px;
  border-radius: 50%;
  border: 2px solid var(--c-bg);
}

.status-dot.available { background: var(--c-online); }
.status-dot.busy { background: var(--c-busy); }
.status-dot.away { background: var(--c-away); }
.status-dot.offline { background: var(--c-offline); }
.status-dot.on_call { background: var(--c-red); }

/* ── Content ── */
.app-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Avatar menu ── */
.avatar-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
}

.avatar-menu {
  position: fixed;
  z-index: 401;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  padding: 8px;
  min-width: 220px;
}

.avatar-menu-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
}

.avatar-menu-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #444;
  flex-shrink: 0;
}

.avatar-menu-name {
  font-size: 13px; font-weight: 600; color: var(--c-text);
}

.avatar-menu-role {
  font-size: 11px; color: var(--c-text-2);
  text-transform: capitalize;
}

.avatar-menu-divider {
  height: 1px;
  background: var(--c-border);
  margin: 4px 0;
}

.avatar-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--c-text);
  text-align: left;
  transition: background 0.12s;
}

.avatar-menu-item:hover { background: var(--c-surface); }
.avatar-menu-item.active { background: var(--c-accent-bg); color: var(--c-accent); }
.avatar-menu-item.logout { color: var(--c-red); }
.avatar-menu-item.logout:hover { background: #fff1f0; }

.status-dot-sm {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot-sm.available { background: var(--c-online); }
.status-dot-sm.busy { background: var(--c-busy); }
.status-dot-sm.away { background: var(--c-away); }
.status-dot-sm.offline { background: var(--c-offline); }

/* ── Logout modal ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--c-bg);
  border-radius: var(--r-xl);
  padding: 28px 32px;
  max-width: 360px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.modal-box h3 {
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 8px;
}

.modal-box p {
  font-size: 14px;
  color: var(--c-text-2);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 24px;
}

.modal-cancel {
  padding: 10px 24px;
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text);
  transition: border-color 0.15s;
}

.modal-cancel:hover { border-color: var(--c-accent); color: var(--c-accent); }

.modal-confirm {
  padding: 10px 24px;
  border: none;
  border-radius: var(--r-sm);
  background: var(--c-red);
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  transition: opacity 0.15s;
}

.modal-confirm:hover { opacity: 0.88; }
</style>
