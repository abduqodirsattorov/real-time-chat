<template>
  <div class="status-selector">
    <button
      v-for="s in statuses"
      :key="s.value"
      :class="['status-btn', s.value, { active: presence.status === s.value }]"
      @click="presence.setStatus(s.value)"
    >
      <span class="dot" />
      {{ t(`presence.${s.value}`) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { usePresenceStore } from '@/stores/presence';
import type { OperatorStatus } from '@/api/presence';

const { t } = useI18n();
const presence = usePresenceStore();

const statuses: { value: OperatorStatus }[] = [
  { value: 'available' },
  { value: 'busy' },
  { value: 'away' },
  { value: 'offline' },
];
</script>

<style scoped>
.status-selector {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.status-btn:hover,
.status-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.available .dot { background: #48bb78; }
.busy .dot { background: #f56565; }
.away .dot { background: #ed8936; }
.offline .dot { background: #a0aec0; }
</style>
