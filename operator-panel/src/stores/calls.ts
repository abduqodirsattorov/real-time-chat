import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Room as LiveKitRoom, RoomEvent, Track, RemoteParticipant } from 'livekit-client';
import { callsApi, type Call, type Recording } from '@/api/calls';

export const useCallsStore = defineStore('calls', () => {
  const incomingCall = ref<Call | null>(null);
  const activeCall = ref<Call | null>(null);
  const activeRecording = ref<Recording | null>(null);
  const livekitRoom = ref<LiveKitRoom | null>(null);
  const isOnHold = ref(false);
  const isMuted = ref(false);
  const remoteAudioTrack = ref<MediaStreamTrack | null>(null);

  async function answerCall(callId: string) {
    const call = await callsApi.answer(callId);
    activeCall.value = call;
    incomingCall.value = null;
    isOnHold.value = false;
    isMuted.value = false;

    if (call.livekitRoom && call.operatorToken && call.livekitUrl) {
      await connectLiveKit(call.livekitUrl, call.livekitRoom, call.operatorToken);
    }
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
    setIncomingCall,
    dismissIncoming,
  };
});
