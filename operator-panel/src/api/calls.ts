import { api } from './client';

export interface CallHistoryItem {
  id: string;
  callerId: string | null;
  calleeId: string | null;
  callerName: string | null;
  calleeName: string | null;
  direction: string;
  status: string;
  talkDurationMs: number | null;
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export interface Call {
  id: string;
  roomId: string;
  callerId: string;
  status: string;
  direction: string;
  livekitRoom: string;
  /** JWT token for the operator to join the LiveKit room */
  operatorToken?: string;
  /** Public WebSocket URL for the browser to connect — ws://localhost:7880 in dev */
  livekitUrl?: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface Recording {
  id: string;
  callId: string;
  status: string;
  consentAnnounced: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  fileUrl: string | null;
}

export const callsApi = {
  answer(callId: string) {
    return api.post(`/calls/${callId}/answer`).then((r) => {
      const d = r.data as Record<string, unknown>;
      // Backend returns { callId, livekitRoom, ... } — normalize to { id, ... }
      return { ...d, id: d.id ?? d.callId } as unknown as Call;
    });
  },

  hangup(callId: string) {
    return api.post(`/calls/${callId}/hangup`);
  },

  hold(callId: string) {
    return api.post(`/calls/${callId}/hold`, { hold: true });
  },

  resume(callId: string) {
    return api.post(`/calls/${callId}/hold`, { hold: false });
  },

  mute(callId: string, muted: boolean) {
    return api.post(`/calls/${callId}/mute`, { muted });
  },

  getLivekitToken(callId: string) {
    return api
      .post<{ token: string; url: string; room: string }>(`/calls/${callId}/livekit-token`)
      .then((r) => r.data);
  },

  outbound(calleeId: string) {
    return api.post('/calls/outbound', { calleeId }).then((r) => {
      const d = r.data as any;
      // Backend returns { call: {...}, status, livekitRoom } — extract inner call
      const callData = (d && typeof d === 'object' && 'call' in d && d.call) ? d.call : d;
      return { ...callData, id: callData?.id ?? callData?.callId } as unknown as Call;
    });
  },

  coldTransfer(callId: string, targetOperatorId: string) {
    return api.post(`/calls/${callId}/transfer`, { type: 'cold', toOperatorId: targetOperatorId });
  },

  warmTransferInit(callId: string, targetOperatorId: string) {
    return api.post(`/calls/${callId}/transfer`, { type: 'warm', toOperatorId: targetOperatorId });
  },

  warmTransferComplete(callId: string) {
    return api.post(`/calls/${callId}/transfer/complete`);
  },

  warmTransferCancel(callId: string) {
    return api.post(`/calls/${callId}/transfer/cancel`);
  },

  startRecording(callId: string) {
    return api.post<Recording>(`/calls/${callId}/recording/start`).then((r) => r.data);
  },

  consentAck(callId: string, recordingId: string) {
    return api
      .post<{ recordingId: string; status: string; egressId: string | null }>(
        `/calls/${callId}/recording/consent-ack`,
        { recordingId },
      )
      .then((r) => r.data);
  },

  stopRecording(callId: string, _recordingId?: string) {
    return api.post(`/calls/${callId}/recording/stop`);
  },

  getHistory(params?: { limit?: number; offset?: number }) {
    return api.get<{ calls: CallHistoryItem[]; total: number }>('/calls', { params }).then((r) => r.data);
  },
};
