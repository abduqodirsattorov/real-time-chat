import 'dart:async';
import 'package:flutter/material.dart';
import '../services/call_service.dart';

class CallScreen extends StatefulWidget {
  final ActiveCall call;
  const CallScreen({super.key, required this.call});

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  late ActiveCall _call;
  StreamSubscription? _sub;
  Timer? _timer;
  int _seconds = 0;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _call = widget.call;
    _sub = CallService().onStateChange.listen(_onCallState);
    if (_call.state == CallState.connected) _startTimer();
  }

  void _onCallState(ActiveCall call) {
    if (!mounted) return;
    setState(() => _call = call);
    if (call.state == CallState.connected && _timer == null) {
      _startTimer();
    }
    if (call.state == CallState.ended) {
      _timer?.cancel();
      Navigator.of(context).pop();
    }
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _seconds++);
    });
  }

  String _formatDuration(int s) {
    final m = s ~/ 60;
    final sec = s % 60;
    return '${m.toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _sub?.cancel();
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isRinging = _call.state == CallState.ringing;
    return Scaffold(
      backgroundColor: const Color(0xFF0d2137),
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const SizedBox(height: 48),
            Column(
              children: [
                const CircleAvatar(
                  radius: 48,
                  backgroundColor: Color(0xFF1e3a5f),
                  child: Icon(Icons.support_agent, size: 48, color: Colors.white),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Operator',
                  style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Text(
                  isRinging ? "Qo'ng'iroq qilinmoqda..." : _formatDuration(_seconds),
                  style: TextStyle(
                    color: isRinging ? Colors.white54 : Colors.greenAccent,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 56),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  if (!isRinging) _buildMuteButton(),
                  _buildHangupButton(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMuteButton() {
    return Column(
      children: [
        GestureDetector(
          onTap: () {
            setState(() => _muted = !_muted);
            CallService().setMuted(_muted);
          },
          child: CircleAvatar(
            radius: 30,
            backgroundColor: _muted ? Colors.white24 : const Color(0xFF1e3a5f),
            child: Icon(
              _muted ? Icons.mic_off : Icons.mic,
              color: Colors.white,
              size: 26,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(_muted ? 'Ovoz o\'ch' : 'Mikrofon', style: const TextStyle(color: Colors.white54, fontSize: 12)),
      ],
    );
  }

  Widget _buildHangupButton() {
    return Column(
      children: [
        GestureDetector(
          onTap: () => CallService().hangup(),
          child: const CircleAvatar(
            radius: 30,
            backgroundColor: Colors.red,
            child: Icon(Icons.call_end, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(height: 6),
        const Text('Tugatish', style: TextStyle(color: Colors.white54, fontSize: 12)),
      ],
    );
  }
}
