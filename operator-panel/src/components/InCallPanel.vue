<template>
  <!-- Compact in-call bar inside room list panel (top item) -->
  <div class="incall-item">
    <div class="incall-info">
      <div class="incall-avatar">
        {{ callerInitials }}
      </div>
      <div class="incall-text">
        <div class="incall-name">{{ callerLabel }}</div>
        <div class="incall-timer">{{ duration }}</div>
      </div>
    </div>

    <div class="incall-controls">
      <button
        :class="['ctrl-btn', 'mute', { active: calls.isMuted }]"
        @click="calls.toggleMute()"
        :title="calls.isMuted ? t('call.unmute') : t('call.mute')"
      >
        <svg v-if="!calls.isMuted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8"/>
        </svg>
      </button>

      <button class="ctrl-btn hangup" @click="calls.hangup()" :title="t('call.hangup')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Full in-call bottom bar when chat is open -->
  <div class="incall-bar">
    <div class="bar-left">
      <span class="bar-label">{{ t('call.active') }}</span>
      <span class="bar-timer">{{ duration }}</span>
    </div>

    <div class="bar-actions">
      <button :class="['bar-btn', { active: calls.isMuted }]" @click="calls.toggleMute()">
        {{ calls.isMuted ? t('call.unmute') : t('call.mute') }}
      </button>
      <button :class="['bar-btn', { active: calls.isOnHold }]" @click="calls.toggleHold()">
        {{ calls.isOnHold ? t('call.resume') : t('call.hold') }}
      </button>
      <RecordingButton />
      <button class="bar-btn" @click="showTransfer = true">{{ t('call.transfer') }}</button>
      <button class="bar-btn hangup-btn" @click="calls.hangup()">{{ t('call.hangup') }}</button>
    </div>

    <TransferDialog v-if="showTransfer" @close="showTransfer = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '@/stores/calls';
import { useAuthStore } from '@/stores/auth';
import RecordingButton from './RecordingButton.vue';
import TransferDialog from './TransferDialog.vue';

const { t } = useI18n();
const calls = useCallsStore();
const auth = useAuthStore();

const showTransfer = ref(false);
const duration = ref('0:00');
let startTs = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

const callerLabel = computed(() => {
  const id = calls.activeCall?.callerId ?? '';
  if (id === auth.user?.id) {
    const calleeId = (calls.activeCall as any)?.calleeId ?? '';
    return calleeId ? `Mijoz #${calleeId.slice(0, 6)}` : 'Noma\'lum';
  }
  return id ? `Mijoz #${id.slice(0, 6)}` : 'Noma\'lum';
});

const callerInitials = computed(() => callerLabel.value.slice(0, 2).toUpperCase());

onMounted(() => {
  startTs = Date.now();
  timer = setInterval(() => {
    const secs = Math.floor((Date.now() - startTs) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    duration.value = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
});

onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
/* ── Compact item in room list panel ── */
.incall-item {
  margin: 8px 10px;
  background: var(--c-accent-bg);
  border: 1.5px solid rgba(91,155,245,0.3);
  border-radius: var(--r-lg);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.incall-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.incall-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: #D1E8FF;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #3B7DD8;
  flex-shrink: 0;
}

.incall-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.incall-timer {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-accent);
  font-variant-numeric: tabular-nums;
}

.incall-controls {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.ctrl-btn {
  width: 34px; height: 34px;
  border-radius: 50%;
  border: none;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  transition: opacity 0.15s;
}

.ctrl-btn:hover { opacity: 0.85; }

.ctrl-btn.mute { background: var(--c-accent); }
.ctrl-btn.mute.active { background: var(--c-text-2); }
.ctrl-btn.hangup { background: var(--c-red); transform: rotate(135deg); }

/* ── Bottom bar ── */
.incall-bar {
  position: fixed;
  bottom: 0;
  left: var(--nav-w);
  right: 0;
  background: #1A2235;
  color: #fff;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 100;
  box-shadow: 0 -2px 20px rgba(0,0,0,0.2);
}

.bar-left {
  display: flex;
  flex-direction: column;
  min-width: 80px;
}

.bar-label {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bar-timer {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

.bar-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.bar-btn {
  padding: 7px 14px;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: none;
  border-radius: var(--r-xl);
  font-size: 12px;
  font-weight: 500;
  transition: background 0.15s;
}

.bar-btn:hover { background: rgba(255,255,255,0.18); }
.bar-btn.active { background: rgba(237, 137, 54, 0.4); }
.hangup-btn { background: rgba(255,59,48,0.35); }
.hangup-btn:hover { background: rgba(255,59,48,0.55); }
</style>
