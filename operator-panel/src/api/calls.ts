import { api } from './client';

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
    return api.post<Call>(`/calls/${callId}/answer`).then((r) => r.data);
  },

  hangup(callId: string) {
    return api.post(`/calls/${callId}/hangup`);
  },

  hold(callId: string) {
    return api.post(`/calls/${callId}/hold`);
  },

  resume(callId: string) {
    return api.post(`/calls/${callId}/resume`);
  },

  mute(callId: string, muted: boolean) {
    return api.post(`/calls/${callId}/mute`, { muted });
  },

  getLivekitToken(callId: string) {
    return api
      .post<{ token: string; url: string; room: string }>(`/calls/livekit/token`, { callId })
      .then((r) => r.data);
  },

  outbound(calleeId: string) {
    return api.post<Call>('/calls/outbound', { calleeId }).then((r) => r.data);
  },

  coldTransfer(callId: string, targetOperatorId: string) {
    return api.post(`/calls/${callId}/transfer/cold`, { targetOperatorId });
  },

  warmTransferInit(callId: string, targetOperatorId: string) {
    return api.post(`/calls/${callId}/transfer/warm/init`, { targetOperatorId });
  },

  warmTransferComplete(callId: string) {
    return api.post(`/calls/${callId}/transfer/warm/complete`);
  },

  warmTransferCancel(callId: string) {
    return api.post(`/calls/${callId}/transfer/warm/cancel`);
  },

  startRecording(callId: string) {
    return api.post<Recording>(`/calls/${callId}/recording/start`).then((r) => r.data);
  },

  consentAck(callId: string, recordingId: string) {
    return api
      .post<{ recordingId: string; status: string; egressId: string | null }>(
        `/calls/${callId}/recording/${recordingId}/consent-ack`,
      )
      .then((r) => r.data);
  },

  stopRecording(callId: string, recordingId: string) {
    return api.post(`/calls/${callId}/recording/${recordingId}/stop`);
  },
};
