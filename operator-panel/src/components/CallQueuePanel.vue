<template>
  <div v-if="queuedCalls.length > 0" class="queue-panel">
    <div class="queue-header">
      <span class="queue-icon">⏳</span>
      <span class="queue-title">Navbat</span>
      <span class="queue-count">{{ queuedCalls.length }}</span>
    </div>
    <div class="queue-items">
      <div v-for="call in queuedCalls" :key="call.id" class="queue-item">
        <div class="queue-item-info">
          <span class="queue-caller">{{ call.callerName ?? `Mijoz #${call.callerId.slice(0, 6)}` }}</span>
          <span class="queue-wait">{{ formatWait(call.waitMs) }}</span>
        </div>
        <button class="pickup-btn" @click="pickup(call.id)" :disabled="!!callsStore.activeCall">Qabul</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useCallsStore } from '@/stores/calls';

interface QueuedCall {
  id: string;
  callerId: string;
  callerName: string | null;
  status: string;
  initiatedAt: string;
  livekitRoom: string;
  waitMs: number;
}

const callsStore = useCallsStore();
const queuedCalls = ref<QueuedCall[]>([]);
let interval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadQueue();
  interval = setInterval(loadQueue, 8_000);
});

onUnmounted(() => { if (interval) clearInterval(interval); });

async function loadQueue() {
  try {
    const res = await api.get<{ queue: QueuedCall[] }>('/calls/queue');
    queuedCalls.value = res.data.queue ?? [];
  } catch (e) {
    console.error('[CallQueuePanel] loadQueue failed:', (e as any)?.response?.data ?? (e as any)?.message ?? e);
  }
}

async function pickup(callId: string) {
  try {
    await callsStore.answerCall(callId);
    await loadQueue();
  } catch (e: unknown) {
    alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Xato');
  }
}

function formatWait(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.queue-panel {
  position: fixed;
  bottom: 70px;
  left: 230px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  z-index: 200;
  min-width: 260px;
  max-width: 320px;
  border-left: 3px solid #ed8936;
}
.queue-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 600;
  font-size: 13px;
  color: #ed8936;
}
.queue-count {
  margin-left: auto;
  background: #ed8936;
  color: #fff;
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 12px;
}
.queue-items { padding: 6px 0; }
.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  gap: 8px;
}
.queue-item-info { flex: 1; }
.queue-caller { display: block; font-size: 13px; font-weight: 600; color: #1a1a1a; }
.queue-wait { font-size: 11px; color: #999; }
.pickup-btn {
  padding: 5px 12px;
  background: #48bb78;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.pickup-btn:hover { background: #38a169; }
</style>
