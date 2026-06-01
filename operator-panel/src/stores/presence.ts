import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { presenceApi, type OperatorStatus, type TransferTarget } from '@/api/presence';
import { useCentrifugeStore } from './centrifuge';

export const usePresenceStore = defineStore('presence', () => {
  const status = ref<OperatorStatus>('offline');
  // Tracks the operator's intended status across reconnects
  const desiredStatus = ref<OperatorStatus>('offline');
  const transferTargets = ref<TransferTarget[]>([]);

  async function setStatus(s: OperatorStatus) {
    await presenceApi.setStatus(s);
    status.value = s;
    desiredStatus.value = s;
  }

  async function loadTransferTargets() {
    transferTargets.value = await presenceApi.getTransferTargets();
  }

  // After Centrifugo reconnects, restore the intended status if it was non-offline.
  // Disconnect webhook sets DB to 'offline'; on reconnect we push desiredStatus back.
  const centrifuge = useCentrifugeStore();
  watch(
    () => centrifuge.connected,
    async (isConnected, wasConnected) => {
      if (isConnected && !wasConnected && desiredStatus.value !== 'offline') {
        try {
          await presenceApi.setStatus(desiredStatus.value);
          status.value = desiredStatus.value;
        } catch (e) {
          console.error('[presence] failed to restore status on reconnect:', e);
        }
      }
    },
  );

  return { status, desiredStatus, transferTargets, setStatus, loadTransferTargets };
});
