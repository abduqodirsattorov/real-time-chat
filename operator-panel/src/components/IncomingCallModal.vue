<template>
  <div class="modal-overlay">
    <div class="modal">
      <div class="call-icon">📞</div>
      <h2>{{ t('call.incoming') }}</h2>
      <p class="caller">{{ calls.incomingCall?.callerId }}</p>
      <div class="actions">
        <button class="answer-btn" @click="answer">{{ t('call.answer') }}</button>
        <button class="reject-btn" @click="calls.dismissIncoming()">{{ t('call.reject') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '@/stores/calls';

const { t } = useI18n();
const calls = useCallsStore();

async function answer() {
  if (!calls.incomingCall) return;
  await calls.answerCall(calls.incomingCall.id);
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 20px;
  padding: 40px 48px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: ring 0.6s ease infinite alternate;
}

@keyframes ring {
  from { transform: scale(1); }
  to { transform: scale(1.02); }
}

.call-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1a1a1a;
}

.caller {
  color: #666;
  margin-bottom: 28px;
  font-size: 15px;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.answer-btn {
  padding: 12px 28px;
  background: #48bb78;
  color: #fff;
  border: none;
  border-radius: 40px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.reject-btn {
  padding: 12px 28px;
  background: #f56565;
  color: #fff;
  border: none;
  border-radius: 40px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
</style>
