<template>
  <div class="recording-wrapper">
    <template v-if="calls.recordingNeedsSync || (calls.activeRecording?.status === 'starting' && calls.activeRecording.consentAnnounced)">
      <button class="action-btn" :disabled="calls.recordingBusy" @click="calls.refreshRecording()">
        {{ t('call.refreshRecording') }}
      </button>
    </template>
    <template v-else-if="!calls.activeRecording">
      <button class="action-btn rec-btn" :disabled="calls.recordingBusy" @click="calls.startRecording()">
        🔴 {{ t('call.recording') }}
      </button>
    </template>
    <template v-else>
      <template v-if="calls.activeRecording.status === 'starting' && !calls.activeRecording.consentAnnounced">
        <button class="action-btn consent-btn" :disabled="calls.recordingBusy" @click="calls.consentAck()">
          {{ t('call.consentAck') }}
        </button>
      </template>
      <template v-else-if="calls.activeRecording.status === 'active'">
        <button class="action-btn stop-rec-btn" :disabled="calls.recordingBusy" @click="calls.stopRecording()">
          ⏹ {{ t('call.stopRecording') }}
        </button>
        <span class="rec-indicator">REC</span>
      </template>
      <template v-else>
        <span class="rec-status">{{ calls.activeRecording.status }}</span>
      </template>
    </template>
    <span v-if="calls.recordingError" class="recording-error" role="alert">{{ t(calls.recordingError) }}</span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '@/stores/calls';

const { t } = useI18n();
const calls = useCallsStore();
</script>

<style scoped>
.recording-wrapper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
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

.action-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.recording-error {
  flex-basis: 100%;
  font-size: 12px;
  color: #fca5a5;
}

.consent-btn {
  background: rgba(72, 187, 120, 0.3);
}

.stop-rec-btn {
  background: rgba(245, 101, 101, 0.3);
}

.rec-indicator {
  font-size: 11px;
  font-weight: 700;
  color: #f56565;
  animation: blink 1s ease infinite;
  letter-spacing: 1px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.rec-status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
