import 'dart:async';
import 'package:livekit_client/livekit_client.dart';
import '../services/api_service.dart';

enum CallState { idle, ringing, connected, ended }

class ActiveCall {
  final String callId;
  final String livekitRoom;
  CallState state;
  String? livekitUrl;
  String? token;
  DateTime? connectedAt;

  ActiveCall({
    required this.callId,
    required this.livekitRoom,
    this.state = CallState.ringing,
    this.livekitUrl,
    this.token,
    this.connectedAt,
  });
}

class CallService {
  static final CallService _instance = CallService._();
  factory CallService() => _instance;
  CallService._();

  Room? _room;
  ActiveCall? _activeCall;
  final _stateController = StreamController<ActiveCall>.broadcast();

  Room? get room => _room;
  ActiveCall? get activeCall => _activeCall;
  Stream<ActiveCall> get onStateChange => _stateController.stream;

  Future<ActiveCall> initiateCall() async {
    final res = await ApiService().post('/calls/initiate', data: {'type': 'audio'});
    final call = res['call'] as Map<String, dynamic>;
    _activeCall = ActiveCall(
      callId: call['id'] as String,
      livekitRoom: res['livekitRoom'] as String,
      state: CallState.ringing,
    );
    _notify();
    return _activeCall!;
  }

  // Called when operator accepts inbound call (Centrifugo call.connected event)
  Future<void> onCallConnected(String livekitUrl, String token) async {
    if (_activeCall == null) return;
    if (_activeCall!.state == CallState.connected) return; // already connected via answerIncomingCall
    _activeCall!.livekitUrl = livekitUrl;
    _activeCall!.token = token;
    _activeCall!.state = CallState.connected;
    _activeCall!.connectedAt = DateTime.now();

    _room = Room(
      roomOptions: const RoomOptions(defaultAudioPublishOptions: AudioPublishOptions()),
    );
    await _room!.connect(livekitUrl, token);
    await _room!.localParticipant?.setMicrophoneEnabled(true);
    _notify();
  }

  // Called when Flutter customer answers an operator-initiated (outbound) call
  Future<ActiveCall> answerIncomingCall(String callId) async {
    final res = await ApiService().post('/calls/$callId/answer');
    final livekitUrl = res['livekitUrl'] as String;
    final token = res['operatorToken'] as String;
    final livekitRoom = res['livekitRoom'] as String;

    _activeCall = ActiveCall(
      callId: callId,
      livekitRoom: livekitRoom,
      state: CallState.connected,
      livekitUrl: livekitUrl,
      token: token,
      connectedAt: DateTime.now(),
    );

    _room = Room(
      roomOptions: const RoomOptions(defaultAudioPublishOptions: AudioPublishOptions()),
    );
    await _room!.connect(livekitUrl, token);
    await _room!.localParticipant?.setMicrophoneEnabled(true);
    _notify();
    return _activeCall!;
  }

  Future<void> hangup() async {
    final call = _activeCall;
    if (call == null) return;
    try {
      await ApiService().post('/calls/${call.callId}/hangup');
    } catch (_) {}
    await _disconnect(CallState.ended);
  }

  void onCallEnded() {
    _disconnect(CallState.ended);
  }

  Future<void> _disconnect(CallState finalState) async {
    _activeCall?.state = finalState;
    _notify();
    await _room?.disconnect();
    _room?.dispose();
    _room = null;
    _activeCall = null;
  }

  void setMuted(bool muted) {
    _room?.localParticipant?.setMicrophoneEnabled(!muted);
  }

  void _notify() {
    if (_activeCall != null) _stateController.add(_activeCall!);
  }

  void dispose() {
    _stateController.close();
    _room?.dispose();
  }
}
