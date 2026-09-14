import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api } from '@/api/client';
import { type Call, type Recording } from '@/api/calls';
import { useCallsStore } from './calls';

vi.mock('livekit-client', () => ({ Room: class {}, RoomEvent: {}, Track: {} }));
vi.mock('@/stores/centrifuge', () => ({ useCentrifugeStore: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }) }));
vi.mock('@/services/ringtone', () => ({ startRingback: vi.fn(), startRingtone: vi.fn(), stopAll: vi.fn() }));

const callId = '00000000-0000-4000-8000-000000000001';
const recordingId = '00000000-0000-4000-8000-000000000002';
const call: Call = { id: callId, roomId: 'room', callerId: 'customer', status: 'connected', direction: 'inbound', livekitRoom: 'livekit-room', startedAt: null, endedAt: null };
const recording: Recording = { id: recordingId, callId, status: 'starting', consentAnnounced: false };

function response(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { config, data, status: 200, statusText: 'OK', headers: {} };
}

function unavailable(config: InternalAxiosRequestConfig): never {
  throw new AxiosError('Recording service unavailable', 'ERR_BAD_RESPONSE', config, undefined, { ...response(config, {}), status: 503 });
}

describe('Recording workflow using the real API client and Pinia store', () => {
  const originalAdapter = api.defaults.adapter;
  let handle: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;
  let requests: InternalAxiosRequestConfig[];

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('localStorage', { getItem: () => null });
    requests = [];
    handle = async config => {
      if (config.method === 'get') return response(config, { callId, recordings: [] });
      if (config.url?.endsWith('/start')) return response(config, { recordingId, status: 'starting', consentAnnounced: false });
      if (config.url?.endsWith('/consent-ack')) return response(config, { recordingId, status: 'active', egressId: 'egress-1' });
      return response(config, { recordingId, status: 'processing', durationMs: 1000 });
    };
    api.defaults.adapter = async config => { requests.push(config); return handle(config); };
    useCallsStore().activeCall = { ...call };
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
  });

  it('starts, acknowledges the returned recordingId and stops recording', async () => {
    const store = useCallsStore();
    await store.startRecording();
    expect(store.activeRecording).toEqual(recording);
    await store.consentAck();
    expect(JSON.parse(requests[1].data)).toEqual({ recordingId });
    expect(store.activeRecording).toMatchObject({ id: recordingId, status: 'active', consentAnnounced: true, egressId: 'egress-1' });
    await store.stopRecording();
    expect(requests.map(req => req.url)).toEqual([
      `/calls/${callId}/recording/start`, `/calls/${callId}/recording/consent-ack`, `/calls/${callId}/recording/stop`,
    ]);
    expect(store.activeRecording).toBeNull();
    expect(store.recordingError).toBeNull();
    expect(store.recordingBusy).toBe(false);
  });

  it('does not send duplicate start requests while the first request is pending', async () => {
    let complete!: () => void;
    handle = config => new Promise(resolve => { complete = () => resolve(response(config, { recordingId, status: 'starting', consentAnnounced: false })); });
    const store = useCallsStore();
    const pending = store.startRecording();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await store.startRecording();
    expect(requests).toHaveLength(1);
    expect(store.recordingBusy).toBe(true);
    complete();
    await pending;
    await store.startRecording();
    expect(requests).toHaveLength(1);
  });

  it('does not apply a late start response to an ended or replaced call', async () => {
    let complete!: () => void;
    handle = config => new Promise(resolve => { complete = () => resolve(response(config, { recordingId, status: 'starting', consentAnnounced: false })); });
    const store = useCallsStore();
    const pending = store.startRecording();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    store.activeCall = { ...call, id: 'next-call' };
    complete();
    await pending;
    expect(store.activeRecording).toBeNull();
  });

  it('reconciles a failed consent response with a recording that actually started', async () => {
    const store = useCallsStore();
    store.activeRecording = { ...recording };
    handle = async config => config.method === 'get'
      ? response(config, { callId, recordings: [{ ...recording, status: 'active', consentAnnounced: true }] })
      : unavailable(config);
    await store.consentAck();
    expect(store.activeRecording?.status).toBe('active');
    expect(store.recordingError).toBe('call.recordingConsentFailed');
    expect(store.recordingNeedsSync).toBe(false);
    expect(requests[1].url).toBe(`/recordings/by-call/${callId}`);
  });

  it('preserves an active recording when stopping failed', async () => {
    const store = useCallsStore();
    const active = { ...recording, status: 'active', consentAnnounced: true };
    store.activeRecording = active;
    handle = async config => config.method === 'get'
      ? response(config, { callId, recordings: [active] }) : unavailable(config);
    await store.stopRecording();
    expect(store.activeRecording).toEqual(active);
    expect(store.recordingError).toBe('call.recordingStopFailed');
  });

  it('blocks further mutations until an uncertain result can be reconciled', async () => {
    const store = useCallsStore();
    handle = async config => unavailable(config);
    await store.startRecording();
    expect(store.recordingNeedsSync).toBe(true);
    await store.startRecording();
    expect(requests).toHaveLength(2);
    handle = async config => response(config, { callId, recordings: [] });
    await store.refreshRecording();
    expect(store.recordingNeedsSync).toBe(false);
    expect(store.recordingError).toBeNull();
  });

  it('does not acknowledge malformed start responses with an undefined ID', async () => {
    const store = useCallsStore();
    handle = async config => response(config, config.method === 'get' ? { callId, recordings: [] } : { status: 'starting' });
    await store.startRecording();
    await store.consentAck();
    expect(store.activeRecording).toBeNull();
    expect(store.recordingError).toBe('call.recordingStartFailed');
    expect(requests.some(req => req.url?.endsWith('/consent-ack'))).toBe(false);
  });

  it('does not acknowledge consent twice or stop an unstarted recording', async () => {
    const store = useCallsStore();
    store.activeRecording = { ...recording };
    await store.stopRecording();
    expect(requests).toHaveLength(0);
    await store.consentAck();
    await store.consentAck();
    expect(requests).toHaveLength(1);
  });
});
