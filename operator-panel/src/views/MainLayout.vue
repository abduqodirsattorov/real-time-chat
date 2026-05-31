<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand">Nova Chat</div>
        <StatusSelector />
      </div>
      <div class="sidebar-bottom">
        <button class="logout-btn" @click="handleLogout">{{ t('common.logout') }}</button>
      </div>
    </aside>

    <main class="content">
      <router-view />
    </main>

    <IncomingCallModal v-if="calls.incomingCall" />
    <InCallPanel v-if="calls.activeCall" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCallsStore } from '@/stores/calls';
import { useCentrifugeStore } from '@/stores/centrifuge';
import StatusSelector from '@/components/StatusSelector.vue';
import IncomingCallModal from '@/components/IncomingCallModal.vue';
import InCallPanel from '@/components/InCallPanel.vue';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const calls = useCallsStore();
const centrifuge = useCentrifugeStore();

onMounted(async () => {
  if (!auth.user) await auth.loadMe();

  // Subscribe personal channel for incoming call events
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
        // Browser notification for incoming call
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification("Nova Chat — Kiruvchi qo'ng'iroq", { body: 'Mijozdan qo\'ng\'iroq keldi', icon: '/favicon.ico' }); } catch { /* */ }
        }
        // call-service publishes { event, callId, callerId, livekitRoom, ts }
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

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  background: #1e3a5f;
  color: #fff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-top {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.brand {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.sidebar-bottom {
  margin-top: auto;
  padding: 16px;
}

.logout-btn {
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.content {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
