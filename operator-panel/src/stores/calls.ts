import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Room as LiveKitRoom, RoomEvent, Track, RemoteParticipant } from 'livekit-client';
import { callsApi, type Call, type Recording } from '@/api/calls';
import { useCentrifugeStore } from '@/stores/centrifuge';

export const useCallsStore = defineStore('calls', () => {
  const incomingCall = ref<Call | null>(null);
  const activeCall = ref<Call | null>(null);
  const activeRecording = ref<Recording | null>(null);
  const livekitRoom = ref<LiveKitRoom | null>(null);
  const isOnHold = ref(false);
  const isMuted = ref(false);
  const remoteAudioTrack = ref<MediaStreamTrack | null>(null);

  async function subscribeToCallChannel(callId: string) {
    const centrifuge = useCentrifugeStore();
    await centrifuge.subscribe(`call:${callId}`, (raw: unknown) => {
      const data = raw as { event?: string; callerToken?: string; livekitUrl?: string };
      if (data.event === 'call.ended') {
        activeCall.value = null;
        activeRecording.value = null;
        isOnHold.value = false;
        isMuted.value = false;
        disconnectLiveKit();
        centrifuge.unsubscribe(`call:${callId}`);
      } else if (data.event === 'call.connected' && data.callerToken && data.livekitUrl) {
        // Outbound: we are the caller — connect LiveKit with callerToken
        if (activeCall.value && !livekitRoom.value) {
          connectLiveKit(data.livekitUrl, activeCall.value.livekitRoom!, data.callerToken);
        }
      }
    });
  }

  async function answerCall(callId: string) {
    const call = await callsApi.answer(callId);
    activeCall.value = call;
    incomingCall.value = null;
    isOnHold.value = false;
    isMuted.value = false;

    if (call.livekitRoom && call.operatorToken) {
      let url = call.livekitUrl;
      if (!url) {
        const tokenData = await callsApi.getLivekitToken(callId);
        url = tokenData.url;
      }
      if (url) await connectLiveKit(url, call.livekitRoom, call.operatorToken);
    }

    await subscribeToCallChannel(callId);
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
    if (!activeCall.value) return;
    await callsApi.hangup(activeCall.value.id);
    await disconnectLiveKit();
    activeCall.value = null;
    activeRecording.value = null;
    isOnHold.value = false;
    isMuted.value = false;
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

  async function startRecording() {
    if (!activeCall.value) return;
    const rec = await callsApi.startRecording(activeCall.value.id);
    activeRecording.value = rec;
  }

  async function consentAck() {
    if (!activeCall.value || !activeRecording.value) return;
    const res = await callsApi.consentAck(activeCall.value.id, activeRecording.value.id);
    if (activeRecording.value) {
      activeRecording.value.status = res.status;
    }
  }

  async function stopRecording() {
    if (!activeCall.value || !activeRecording.value) return;
    await callsApi.stopRecording(activeCall.value.id, activeRecording.value.id);
    activeRecording.value = null;
  }

  async function startOutbound(calleeId: string) {
    const call = await callsApi.outbound(calleeId);
    activeCall.value = call;
    incomingCall.value = null;
    isOnHold.value = false;
    isMuted.value = false;
    // Outbound: no token yet — wait for call.connected event on call channel
    // (callerToken arrives when callee answers)
    await subscribeToCallChannel(call.id);
  }

  function setIncomingCall(call: Call) {
    incomingCall.value = call;
  }

  function dismissIncoming() {
    incomingCall.value = null;
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
