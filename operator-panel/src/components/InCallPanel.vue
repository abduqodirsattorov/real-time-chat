<template>
  <div class="incall-panel">
    <div class="call-info">
      <span class="call-label">{{ t('call.active') }}</span>
      <span class="call-duration">{{ duration }}</span>
    </div>

    <div class="call-actions">
      <button :class="['action-btn', { active: calls.isMuted }]" @click="calls.toggleMute()">
        {{ calls.isMuted ? t('call.unmute') : t('call.mute') }}
      </button>
      <button :class="['action-btn', { active: calls.isOnHold }]" @click="calls.toggleHold()">
        {{ calls.isOnHold ? t('call.resume') : t('call.hold') }}
      </button>
      <RecordingButton />
      <button class="action-btn transfer-btn" @click="showTransfer = true">
        {{ t('call.transfer') }}
      </button>
      <button class="action-btn hangup-btn" @click="calls.hangup()">
        {{ t('call.hangup') }}
      </button>
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

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.incall-panel {
  position: fixed;
  bottom: 0;
  left: 220px;
  right: 0;
  background: #1e3a5f;
  color: #fff;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  z-index: 100;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
}

.call-info {
  display: flex;
  flex-direction: column;
  min-width: 80px;
}

.call-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.call-duration {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.call-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.action-btn.active {
  background: rgba(237, 137, 54, 0.4);
}

.hangup-btn {
  background: rgba(245, 101, 101, 0.3);
}

.hangup-btn:hover {
  background: rgba(245, 101, 101, 0.5);
}
</style>
