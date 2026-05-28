import { defineStore } from 'pinia';
import { ref } from 'vue';
import { presenceApi, type OperatorStatus, type TransferTarget } from '@/api/presence';

export const usePresenceStore = defineStore('presence', () => {
  const status = ref<OperatorStatus>('offline');
  const transferTargets = ref<TransferTarget[]>([]);

  async function setStatus(s: OperatorStatus) {
    await presenceApi.setStatus(s);
    status.value = s;
  }

  async function loadTransferTargets() {
    transferTargets.value = await presenceApi.getTransferTargets();
  }

  return { status, transferTargets, setStatus, loadTransferTargets };
});
