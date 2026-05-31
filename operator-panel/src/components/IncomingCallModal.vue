<template>
  <!-- Shown inline in the room list panel (top item) -->
  <div class="incoming-call-item">
    <div class="ic-info">
      <div class="ic-avatar">
        {{ callerInitials }}
      </div>
      <div class="ic-text">
        <div class="ic-name">{{ callerLabel }}</div>
        <div class="ic-status">Is calling...</div>
      </div>
      <button class="ic-info-btn" title="Info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      </button>
    </div>

    <div class="ic-actions">
      <button class="ic-answer" @click="answer" :title="t('call.answer')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
        </svg>
      </button>
      <button class="ic-reject" @click="calls.dismissIncoming()" :title="t('call.reject')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '@/stores/calls';

const { t } = useI18n();
const calls = useCallsStore();

const callerLabel = computed(() => {
  const id = calls.incomingCall?.callerId ?? '';
  return id ? `Mijoz #${id.slice(0, 6)}` : 'Noma\'lum';
});

const callerInitials = computed(() => {
  return callerLabel.value.slice(0, 2).toUpperCase();
});

async function answer() {
  if (!calls.incomingCall) return;
  await calls.answerCall(calls.incomingCall.id);
}
</script>

<style scoped>
.incoming-call-item {
  margin: 8px 10px;
  background: var(--c-accent-bg);
  border: 1.5px solid rgba(91,155,245,0.25);
  border-radius: var(--r-lg);
  padding: 12px 14px;
  animation: ring-pulse 1.2s ease infinite alternate;
}

@keyframes ring-pulse {
  from { border-color: rgba(91,155,245,0.2); }
  to   { border-color: rgba(91,155,245,0.6); }
}

.ic-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.ic-avatar {
  width: 40px; height: 40px;
  border-radius: 50%;
  background: #D1E8FF;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #3B7DD8;
  flex-shrink: 0;
}

.ic-text { flex: 1; }

.ic-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
}

.ic-status {
  font-size: 12px;
  color: var(--c-text-2);
}

.ic-info-btn {
  width: 28px; height: 28px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  color: var(--c-text-2);
  display: flex; align-items: center; justify-content: center;
}

.ic-actions {
  display: flex;
  gap: 8px;
}

.ic-answer, .ic-reject {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: var(--r-xl);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  transition: opacity 0.15s;
}

.ic-answer {
  background: var(--c-green);
}

.ic-reject {
  background: var(--c-red);
  transform: rotate(135deg);
}

.ic-answer:hover, .ic-reject:hover { opacity: 0.85; }
</style>
