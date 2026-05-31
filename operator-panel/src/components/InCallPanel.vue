<template>
  <!-- Bottom action bar (card is rendered in RoomList) -->
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
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '@/stores/calls';
import RecordingButton from './RecordingButton.vue';
import TransferDialog from './TransferDialog.vue';

const { t } = useI18n();
const calls = useCallsStore();
const showTransfer = ref(false);
const duration = ref('0:00');
let startTs = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

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

.bar-left { display: flex; flex-direction: column; min-width: 80px; }

.bar-label {
  font-size: 10px; color: rgba(255,255,255,0.5);
  text-transform: uppercase; letter-spacing: 0.5px;
}

.bar-timer {
  font-size: 20px; font-weight: 700;
  font-variant-numeric: tabular-nums; color: #fff;
}

.bar-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

.bar-btn {
  padding: 7px 14px;
  background: rgba(255,255,255,0.1);
  color: #fff; border: none;
  border-radius: var(--r-xl);
  font-size: 12px; font-weight: 500;
  transition: background 0.15s;
}
.bar-btn:hover { background: rgba(255,255,255,0.18); }
.bar-btn.active { background: rgba(237, 137, 54, 0.4); }
.hangup-btn { background: rgba(255,59,48,0.35); }
.hangup-btn:hover { background: rgba(255,59,48,0.55); }
</style>
