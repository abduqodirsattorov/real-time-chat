<template>
  <div class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog">
      <h3>{{ t('transfer.title') }}</h3>

      <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
      <template v-else>
        <div class="operator-list">
          <div
            v-for="op in targets"
            :key="op.id"
            :class="['operator-item', { selected: selectedId === op.id }]"
            @click="selectedId = op.id"
          >
            <span class="op-name">{{ op.fullName }}</span>
            <span :class="['op-status', op.status]">{{ statusLabel(op.status) }}</span>
          </div>
          <div v-if="targets.length === 0" class="empty">{{ t('common.error') }}</div>
        </div>

        <div class="dialog-actions">
          <button :disabled="!selectedId" class="cold-btn" @click="coldTransfer">
            {{ t('transfer.cold') }}
          </button>
          <button :disabled="!selectedId || warmInitiated" class="warm-btn" @click="warmTransferInit">
            {{ t('transfer.warm') }}
          </button>
          <button v-if="warmInitiated" class="complete-btn" @click="warmTransferComplete">
            {{ t('transfer.complete') }}
          </button>
          <button class="cancel-btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePresenceStore } from '@/stores/presence';
import { useCallsStore } from '@/stores/calls';
import { callsApi } from '@/api/calls';
import type { TransferTarget } from '@/api/presence';

const emit = defineEmits<{ close: [] }>();
const { t, te } = useI18n();

function statusLabel(status: string): string {
  const key = `presence.${status}`;
  return te(key) ? t(key) : status;
}
const presence = usePresenceStore();
const calls = useCallsStore();

const loading = ref(true);
const targets = ref<TransferTarget[]>([]);
const selectedId = ref<string | null>(null);
const warmInitiated = ref(false);

onMounted(async () => {
  await presence.loadTransferTargets();
  targets.value = presence.transferTargets;
  loading.value = false;
});

async function coldTransfer() {
  if (!calls.activeCall || !selectedId.value) return;
  await callsApi.coldTransfer(calls.activeCall.id, selectedId.value);
  emit('close');
}

async function warmTransferInit() {
  if (!calls.activeCall || !selectedId.value) return;
  await callsApi.warmTransferInit(calls.activeCall.id, selectedId.value);
  warmInitiated.value = true;
}

async function warmTransferComplete() {
  if (!calls.activeCall) return;
  await callsApi.warmTransferComplete(calls.activeCall.id);
  emit('close');
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog {
  background: #fff;
  border-radius: 16px;
  padding: 28px;
  width: 360px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

h3 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1a1a1a;
}

.operator-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 16px;
}

.operator-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #f0f0f0;
}

.operator-item:last-child { border-bottom: none; }
.operator-item:hover { background: #f7fafc; }
.operator-item.selected { background: #e8f0fe; }

.op-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}

.op-status {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.op-status.available { background: #c6f6d5; color: #276749; }
.op-status.busy { background: #fed7d7; color: #c53030; }
.op-status.away { background: #fefcbf; color: #744210; }
.op-status.offline { background: #e2e8f0; color: #4a5568; }

.dialog-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dialog-actions button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.dialog-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cold-btn { background: #bee3f8; color: #2b6cb0; }
.warm-btn { background: #c6f6d5; color: #276749; }
.complete-btn { background: #48bb78; color: #fff; }
.cancel-btn { background: #e2e8f0; color: #4a5568; }

.loading, .empty {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
