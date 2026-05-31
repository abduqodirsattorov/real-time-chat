import 'dart:convert';
import 'package:centrifuge/centrifuge.dart' as centrifuge;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/message.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../services/centrifuge_service.dart';
import '../services/api_service.dart';
import '../services/call_service.dart';
import '../services/notification_service.dart';
import 'call_screen.dart';
import 'login_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _initialized = false;
  bool _typing = false;
  String? _callId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    final chat = context.read<ChatProvider>();
    final userId = context.read<AuthProvider>().user?.id;

    await CentrifugeService().connect();

    // Subscribe to personal channel FIRST — receives outbound calls from operator
    if (userId != null) {
      await CentrifugeService().subscribe('chat:user#$userId', _onUserEvent);
    }

    final room = await chat.getOrCreateSupportRoom();
    if (room == null) return;

    await chat.loadMessages(room.id);
    await CentrifugeService().subscribe('chat:room#${room.id}', _onRoomEvent);

    if (mounted) setState(() => _initialized = true);
    if (mounted) _scrollToBottom();
  }

  void _onUserEvent(centrifuge.PublicationEvent event) {
    if (!mounted) return;
    final data = jsonDecode(utf8.decode(event.data)) as Map<String, dynamic>;
    if (data['event'] == 'call.incoming' && _callId == null) {
      final callId = data['callId'] as String?;
      if (callId != null) {
        NotificationService().notifyIncomingCall();
        _showIncomingCallDialog(callId);
      }
    }
  }

  void _showIncomingCallDialog(String callId) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.call, color: Color(0xFF1e3a5f)),
            SizedBox(width: 8),
            Text("Kiruvchi qo'ng'iroq"),
          ],
        ),
        content: const Text('Operator siz bilan bog\'lanmoqda...'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _rejectIncomingCall(callId);
            },
            child: const Text('Rad etish', style: TextStyle(color: Colors.red)),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF48bb78)),
            icon: const Icon(Icons.call, color: Colors.white, size: 18),
            label: const Text('Qabul qilish', style: TextStyle(color: Colors.white)),
            onPressed: () {
              Navigator.of(context).pop();
              _acceptIncomingCall(callId);
            },
          ),
        ],
      ),
    );
  }

  Future<void> _acceptIncomingCall(String callId) async {
    _callId = callId;
    try {
      await CentrifugeService().subscribe('call:$callId', _onCallEvent);
      final active = await CallService().answerIncomingCall(callId);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => CallScreen(call: active)),
      );
      CentrifugeService().unsubscribe('call:$callId');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Qo'ng'iroqni qabul qilishda xato: $e")),
        );
      }
    } finally {
      _callId = null;
    }
  }

  Future<void> _rejectIncomingCall(String callId) async {
    try {
      await ApiService().post('/calls/$callId/hangup');
    } catch (_) {}
  }

  void _onCallEvent(centrifuge.PublicationEvent event) {
    if (!mounted) return;
    final data = jsonDecode(utf8.decode(event.data)) as Map<String, dynamic>;
    final ev = data['event'] as String?;

    if (ev == 'call.connected') {
      final livekitUrl = data['livekitUrl'] as String?;
      final token = data['callerToken'] as String?;
      if (livekitUrl != null && token != null) {
        CallService().onCallConnected(livekitUrl, token);
      }
    } else if (ev == 'call.ended') {
      CallService().onCallEnded();
      _callId = null;
    }
  }

  Future<void> _startCall() async {
    if (_callId != null) return;
    try {
      final active = await CallService().initiateCall();
      _callId = active.callId;
      // Subscribe to this specific call's channel to receive call.connected / call.ended
      await CentrifugeService().subscribe('call:${active.callId}', _onCallEvent);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => CallScreen(call: active)),
      );
      CentrifugeService().unsubscribe('call:${active.callId}');
      _callId = null;
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Qo'ng'iroqni boshlashda xato: $e")),
      );
    }
  }

  void _onRoomEvent(centrifuge.PublicationEvent event) {
    if (!mounted) return;
    final data = jsonDecode(utf8.decode(event.data)) as Map<String, dynamic>;
    if (data['event'] == 'message.created' && data['message'] != null) {
      final msg = data['message'] as Map<String, dynamic>;
      context.read<ChatProvider>().addMessage(Message.fromJson(msg));
      _scrollToBottom();
      // Notify if window not focused
      final content = msg['content'] as String? ?? '';
      if (content.isNotEmpty) {
        NotificationService().notifyMessage('Operator: $content');
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    final roomId = context.read<ChatProvider>().supportRoomId;
    if (roomId != null) CentrifugeService().unsubscribe('chat:room#$roomId');
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final chat = context.watch<ChatProvider>();
    final room = chat.activeRoom;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e3a5f),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(room?.displayTitle ?? 'Yordam', style: const TextStyle(color: Colors.white, fontSize: 16)),
            Text(auth.user?.displayName ?? '', style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.call, color: Colors.white),
            tooltip: "Qo'ng'iroq",
            onPressed: _callId == null ? _startCall : null,
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: _logout,
          ),
        ],
      ),
      body: !_initialized
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: chat.loadingMessages
                      ? const Center(child: CircularProgressIndicator())
                      : ListView.builder(
                          controller: _scrollCtrl,
                          padding: const EdgeInsets.all(12),
                          itemCount: chat.messages.length,
                          itemBuilder: (_, i) => _MessageBubble(
                            message: chat.messages[i],
                            isOwn: chat.messages[i].senderId == auth.user?.id,
                          ),
                        ),
                ),
                _buildInput(chat, room?.id),
              ],
            ),
    );
  }

  Widget _buildInput(ChatProvider chat, String? roomId) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4)],
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _msgCtrl,
              decoration: const InputDecoration(
                hintText: 'Xabar yozing...',
                border: InputBorder.none,
              ),
              maxLines: null,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(chat, roomId),
              onChanged: (_) {
                if (!_typing && roomId != null) {
                  _typing = true;
                  chat.sendTyping(roomId);
                  Future.delayed(const Duration(seconds: 3), () => _typing = false);
                }
              },
            ),
          ),
          IconButton(
            icon: const Icon(Icons.send, color: Color(0xFF1e3a5f)),
            onPressed: () => _send(chat, roomId),
          ),
        ],
      ),
    );
  }

  Future<void> _send(ChatProvider chat, String? roomId) async {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty || roomId == null) return;
    _msgCtrl.clear();
    await chat.sendMessage(roomId, text);
    _scrollToBottom();
  }

  Future<void> _logout() async {
    CentrifugeService().disconnect();
    context.read<ChatProvider>().clear();
    await context.read<AuthProvider>().logout();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;
  final bool isOwn;

  const _MessageBubble({required this.message, required this.isOwn});

  @override
  Widget build(BuildContext context) {
    if (message.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              message.localizedContent('uz'),
              style: const TextStyle(fontSize: 12, color: Colors.grey, fontStyle: FontStyle.italic),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: isOwn ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isOwn ? const Color(0xFF1e3a5f) : Colors.grey.shade100,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isOwn ? 16 : 4),
                  bottomRight: Radius.circular(isOwn ? 4 : 16),
                ),
                boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 2)],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    message.content ?? '',
                    style: TextStyle(color: isOwn ? Colors.white : Colors.black87, fontSize: 15),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _formatTime(message.createdAt),
                    style: TextStyle(
                      fontSize: 10,
                      color: isOwn ? Colors.white60 : Colors.grey,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
