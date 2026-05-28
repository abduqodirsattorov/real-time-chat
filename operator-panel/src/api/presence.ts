import { api } from './client';

export type OperatorStatus = 'available' | 'busy' | 'away' | 'offline';

export interface TransferTarget {
  id: string;
  fullName: string;
  status: OperatorStatus;
}

export const presenceApi = {
  setStatus(status: OperatorStatus) {
    return api.post('/operator/status', { status });
  },

  getOnline() {
    return api.get<TransferTarget[]>('/operator/online').then((r) => r.data);
  },

  getTransferTargets() {
    return api.get<TransferTarget[]>('/operator/transfer-targets').then((r) => r.data);
  },
};
