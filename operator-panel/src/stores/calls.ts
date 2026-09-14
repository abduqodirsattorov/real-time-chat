import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Room as LiveKitRoom, RoomEvent, Track, RemoteParticipant } from 'livekit-client';
import { callsApi, type Call, type Recording } from '@/api/calls';
import { useCentrifugeStore } from '@/stores/centrifuge';
import { startRingback, startRingtone, stopAll as stopRingtone } from '@/services/ringtone';

export const useCallsStore = defineStore('calls', () => {
  const incomingCall = ref<Call | null>(null);
  const activeCall = ref<Call | null>(null);
  const activeRecording = ref<Recording | null>(null);
  const recordingBusy = ref(false);
  const recordingError = ref<string | null>(null);
  const recordingNeedsSync = ref(false);
  const livekitRoom = ref<LiveKitRoom | null>(null);
  const isOnHold = ref(false);
  const isMuted = ref(false);
  const remoteAudioTrack = ref<MediaStreamTrack | null>(null);

  // ONE subscription per call handles ALL events (ringing + active).
  // Called in setIncomingCall and startOutbound — NOT in answerCall.
  async function subscribeToCallChannel(callId: string) {
    const centrifuge = useCentrifugeStore();
    await centrifuge.subscribe(`call:${callId}`, (raw: unknown) => {
      const data = raw as { event?: string; callerToken?: string; livekitUrl?: string };

      if (data.event === 'call.ended') {
        stopRingtone();
        // Dismiss incoming card (customer hung up before operator answered)
        if (incomingCall.value?.id === callId) {
          incomingCall.value = null;
        }
        // End active call
        if (activeCall.value?.id === callId) {
          activeCall.value = null;
          activeRecording.value = null;
          recordingError.value = null;
          recordingNeedsSync.value = false;
          isOnHold.value = false;
          isMuted.value = false;
          disconnectLiveKit();
        }
        centrifuge.unsubscribe(`call:${callId}`);

      } else if (data.event === 'call.connected' && data.callerToken && data.livekitUrl) {
        // Outbound: caller gets token when callee answers
        stopRingtone();
        if (activeCall.value?.id === callId && !livekitRoom.value) {
          connectLiveKit(data.livekitUrl, activeCall.value.livekitRoom!, data.callerToken);
        }
      }
    });
  }

  async function answerCall(callId: string) {
    stopRingtone();
    const call = await callsApi.answer(callId);
    activeCall.value = call;
    incomingCall.value = null;
    isOnHold.value = false;
    isMuted.value = false;

    // Connect LiveKit with operator token from answer response
    if (call.livekitRoom && call.operatorToken) {
      let url = call.livekitUrl;
      if (!url) {
        const tokenData = await callsApi.getLivekitToken(callId);
        url = tokenData.url;
      }
      if (url) await connectLiveKit(url, call.livekitRoom, call.operatorToken);
    }
    // NOTE: No subscribeToCallChannel here — already subscribed in setIncomingCall
  }

  async function connectLiveKit(url: string, roomName: string, token: string) {
    const room = new LiveKitRoom({
      adaptiveStream: true,
      dynacast: true,
    });

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        remoteAudioTrack.value = track.mediaStreamTrack;
        const audio = new Audio();
        audio.srcObject = new MediaStream([track.mediaStreamTrack]);
        audio.play().catch(() => {});
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      livekitRoom.value = null;
      remoteAudioTrack.value = null;
    });

    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
    livekitRoom.value = room;
  }

  async function hangup() {
    stopRingtone();
    if (!activeCall.value) return;
    const callId = activeCall.value.id;
    activeCall.value = null;
    activeRecording.value = null;
    recordingError.value = null;
    recordingNeedsSync.value = false;
    isOnHold.value = false;
    isMuted.value = false;
    await disconnectLiveKit();
    const centrifuge = useCentrifugeStore();
    centrifuge.unsubscribe(`call:${callId}`);
    try {
      await callsApi.hangup(callId);
    } catch (e) {
      console.error('[calls] hangup API failed:', (e as any)?.response?.data ?? (e as any)?.message);
    }
  }

  async function toggleHold() {
    if (!activeCall.value) return;
    if (isOnHold.value) {
      await callsApi.resume(activeCall.value.id);
    } else {
      await callsApi.hold(activeCall.value.id);
    }
    isOnHold.value = !isOnHold.value;
  }

  async function toggleMute() {
    if (!activeCall.value) return;
    isMuted.value = !isMuted.value;
    await callsApi.mute(activeCall.value.id, isMuted.value);
    if (livekitRoom.value) {
      await livekitRoom.value.localParticipant.setMicrophoneEnabled(!isMuted.value);
    }
  }

  async function syncRecording(callId: string) {
    try {
      const recordings = await callsApi.getRecordings(callId);
      if (activeCall.value?.id !== callId) return;
      activeRecording.value = recordings.find(rec => ['starting', 'active'].includes(rec.status)) ?? null;
      recordingNeedsSync.value = false;
    } catch {
      if (activeCall.value?.id === callId) recordingNeedsSync.value = true;
    }
  }

  async function refreshRecording() {
    if (!activeCall.value || recordingBusy.value) return;
    const callId = activeCall.value.id;
    recordingBusy.value = true;
    try {
      await syncRecording(callId);
      if (activeCall.value?.id === callId && !recordingNeedsSync.value) recordingError.value = null;
    } finally {
      recordingBusy.value = false;
    }
  }

  async function recordingAction(action: () => Promise<void>, errorKey: string) {
    if (!activeCall.value || recordingBusy.value || recordingNeedsSync.value) return;
    const callId = activeCall.value.id;
    recordingBusy.value = true;
    recordingError.value = null;
    try {
      await action();
    } catch {
      if (activeCall.value?.id !== callId) return;
      recordingError.value = errorKey;
      // A failed HTTP response does not prove the server did not start recording.
      await syncRecording(callId);
    } finally {
      recordingBusy.value = false;
    }
  }

  async function startRecording() {
    if (!activeCall.value || activeRecording.value) return;
    const callId = activeCall.value.id;
    await recordingAction(async () => {
      const rec = await callsApi.startRecording(callId);
      if (activeCall.value?.id === callId) activeRecording.value = rec;
    }, 'call.recordingStartFailed');
  }

  async function consentAck() {
    const rec = activeRecording.value;
    if (!activeCall.value || !rec || rec.status !== 'starting' || rec.consentAnnounced) return;
    const callId = activeCall.value.id;
    await recordingAction(async () => {
      const result = await callsApi.consentAck(callId, rec.id);
      if (activeCall.value?.id === callId && activeRecording.value?.id === rec.id) {
        activeRecording.value = { ...rec, status: result.status, consentAnnounced: true, egressId: result.egressId };
      }
    }, 'call.recordingConsentFailed');
  }

  async function stopRecording() {
    const rec = activeRecording.value;
    if (!activeCall.value || !rec || rec.status !== 'active') return;
    const callId = activeCall.value.id;
    await recordingAction(async () => {
      await callsApi.stopRecording(callId);
      if (activeCall.value?.id === callId && activeRecording.value?.id === rec.id) activeRecording.value = null;
    }, 'call.recordingStopFailed');
  }

  async function startOutbound(calleeId: string) {
    const call = await callsApi.outbound(calleeId);
    startRingback();
    activeCall.value = call;
    incomingCall.value = null;
    isOnHold.value = false;
    isMuted.value = false;
    // Outbound: no token yet — wait for call.connected event on call channel
    // (callerToken arrives when callee answers)
    await subscribeToCallChannel(call.id);
  }

  async function setIncomingCall(call: Call) {
    incomingCall.value = call;
    startRingtone();
    // Subscribe immediately so we catch call.ended even before operator answers
    await subscribeToCallChannel(call.id);
  }

  async function dismissIncoming() {
    stopRingtone();
    const call = incomingCall.value;
    incomingCall.value = null;
    if (call) {
      // Notify backend — caller side will receive call.ended
      try { await callsApi.hangup(call.id); } catch {}
      const centrifuge = useCentrifugeStore();
      centrifuge.unsubscribe(`call:${call.id}`);
    }
  }

  async function disconnectLiveKit() {
    if (livekitRoom.value) {
      await livekitRoom.value.disconnect();
      livekitRoom.value = null;
    }
    remoteAudioTrack.value = null;
  }

  return {
    incomingCall,
    activeCall,
    activeRecording,
    recordingBusy,
    recordingError,
    recordingNeedsSync,
    refreshRecording,
    livekitRoom,
    isOnHold,
    isMuted,
    remoteAudioTrack,
    answerCall,
    hangup,
    toggleHold,
    toggleMute,
    startRecording,
    consentAck,
    stopRecording,
    startOutbound,
    setIncomingCall,
    dismissIncoming,
  };
});
