import 'dart:async';
import 'dart:convert';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html show document, window;
import 'package:centrifuge/centrifuge.dart' as centrifuge;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/message.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../services/api_service.dart';
import '../services/call_service.dart';
import '../services/centrifuge_service.dart';
import '../services/media_service.dart';
import '../services/notification_service.dart';
import '../services/voice_recorder_service.dart';
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

  // Typing indicator
  bool _opTyping = false;
  Timer? _typingTimer;

  // File upload
  PlatformFile? _selectedFile;
  double? _uploadProgress;

  // Voice recorder
  bool _recording = false;
  Timer? _recordingTimer;
  int _recordingSeconds = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    final chat = context.read<ChatProvider>();
    final userId = context.read<AuthProvider>().user?.id;

    await CentrifugeService().connect();

    if (userId != null) {
      await CentrifugeService().subscribe('chat:user#$userId', _onUserEvent);
    }

    final room = await chat.getOrCreateSupportRoom();
    if (room == null) return;

    await chat.loadMessages(room.id);
    await CentrifugeService().subscribe('chat:room#${room.id}', _onRoomEvent);

    // Mark last message as read
    if (chat.messages.isNotEmpty) {
      chat.markRead(chat.messages.last.id);
    }

    if (mounted) setState(() => _initialized = true);
    if (mounted) _scrollToBottom();
  }

  // ── Incoming call ─────────────────────────────────────────────────────────

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
        title: const Row(children: [
          Icon(Icons.call, color: Color(0xFF1e3a5f)),
          SizedBox(width: 8),
          Text("Kiruvchi qo'ng'iroq"),
        ]),
        content: const Text("Operator siz bilan bog'lanmoqda..."),
        actions: [
          TextButton(
            onPressed: () { Navigator.of(context).pop(); _rejectIncomingCall(callId); },
            child: const Text('Rad etish', style: TextStyle(color: Colors.red)),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF48bb78)),
            icon: const Icon(Icons.call, color: Colors.white, size: 18),
            label: const Text('Qabul qilish', style: TextStyle(color: Colors.white)),
            onPressed: () { Navigator.of(context).pop(); _acceptIncomingCall(callId); },
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
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CallScreen(call: active)));
      CentrifugeService().unsubscribe('call:$callId');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Xato: $e")));
    } finally { _callId = null; }
  }

  Future<void> _rejectIncomingCall(String callId) async {
    try { await ApiService().post('/calls/$callId/hangup'); } catch (_) {}
  }

  // ── Call events ───────────────────────────────────────────────────────────

  void _onCallEvent(centrifuge.PublicationEvent event) {
    if (!mounted) return;
    final data = jsonDecode(utf8.decode(event.data)) as Map<String, dynamic>;
    final ev = data['event'] as String?;
    if (ev == 'call.connected') {
      final url = data['livekitUrl'] as String?;
      final token = data['callerToken'] as String?;
      if (url != null && token != null) CallService().onCallConnected(url, token);
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
      await CentrifugeService().subscribe('call:${active.callId}', _onCallEvent);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CallScreen(call: active)));
      CentrifugeService().unsubscribe('call:${active.callId}');
      _callId = null;
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Xato: $e")));
    }
  }

  // ── Room events ───────────────────────────────────────────────────────────

  void _onRoomEvent(centrifuge.PublicationEvent event) {
    if (!mounted) return;
    final data = jsonDecode(utf8.decode(event.data)) as Map<String, dynamic>;

    if (data['event'] == 'message.created' && data['message'] != null) {
      final msg = data['message'] as Map<String, dynamic>;
      final ownId = context.read<AuthProvider>().user?.id;
      final message = Message.fromJson(msg);
      context.read<ChatProvider>().addMessage(message);

      if (message.senderId != ownId) {
        context.read<ChatProvider>().incrementUnread();
        _updateTabTitle(context.read<ChatProvider>().unreadCount);
        final content = message.type == 'text' ? (message.content ?? '') : '📎 Fayl';
        if (content.isNotEmpty) NotificationService().notifyMessage('Operator: $content');
        // Mark read
        context.read<ChatProvider>().markRead(message.id);
      }
      _scrollToBottom();
    }

    if (data['event'] == 'user.typing') {
      final typingId = data['userId'] as String?;
      final ownId = context.read<AuthProvider>().user?.id;
      if (typingId != null && typingId != ownId) {
        setState(() => _opTyping = true);
        _typingTimer?.cancel();
        _typingTimer = Timer(const Duration(seconds: 3), () {
          if (mounted) setState(() => _opTyping = false);
        });
      }
    }
  }

  void _updateTabTitle(int unread) {
    if (!kIsWeb) return;
    try { html.document.title = unread > 0 ? '($unread) Nova Chat' : 'Nova Chat'; } catch (_) {}
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
        context.read<ChatProvider>().clearUnread();
        _updateTabTitle(0);
      }
    });
  }

  // ── File picker ───────────────────────────────────────────────────────────

  Future<void> _pickFile() async {
    final file = await MediaService().pickFile();
    if (file != null) setState(() { _selectedFile = file; _uploadProgress = null; });
  }

  void _clearFile() => setState(() { _selectedFile = null; _uploadProgress = null; });

  // ── Voice recorder ────────────────────────────────────────────────────────

  Future<void> _startRecording() async {
    try {
      await VoiceRecorderService().start();
      _recordingSeconds = 0;
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _recordingSeconds++);
      });
      setState(() => _recording = true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _stopRecordingAndSend(ChatProvider chat, String? roomId) async {
    _recordingTimer?.cancel();
    setState(() { _recording = false; _recordingSeconds = 0; });
    if (roomId == null) { VoiceRecorderService().cancel(); return; }
    try {
      final file = await VoiceRecorderService().stop();
      if (file == null || file.size < 100) return;
      setState(() => _uploadProgress = 0.01);
      final att = await MediaService().upload(file, onProgress: (p) => setState(() => _uploadProgress = p));
      setState(() => _uploadProgress = null);
      await chat.sendMessage(roomId, att.id, type: 'audio');
      _scrollToBottom();
    } catch (e) {
      setState(() => _uploadProgress = null);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Yuklash xatosi: $e')));
    }
  }

  void _cancelRecording() {
    _recordingTimer?.cancel();
    VoiceRecorderService().cancel();
    setState(() { _recording = false; _recordingSeconds = 0; });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  Future<void> _send(ChatProvider chat, String? roomId) async {
    if (roomId == null) return;
    if (_selectedFile != null) { await _sendFile(chat, roomId, _selectedFile!); return; }
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    _msgCtrl.clear();
    await chat.sendMessage(roomId, text);
    _scrollToBottom();
  }

  Future<void> _sendFile(ChatProvider chat, String roomId, PlatformFile file) async {
    setState(() => _uploadProgress = 0.01);
    try {
      final att = await MediaService().upload(file, onProgress: (p) => setState(() => _uploadProgress = p));
      _clearFile();
      await chat.sendMessage(roomId, att.id, type: att.msgType);
      _scrollToBottom();
    } catch (e) {
      setState(() => _uploadProgress = null);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Yuklash xatosi: $e')));
    }
  }

  @override
  void dispose() {
    _typingTimer?.cancel();
    _recordingTimer?.cancel();
    VoiceRecorderService().cancel();
    final roomId = context.read<ChatProvider>().supportRoomId;
    if (roomId != null) CentrifugeService().unsubscribe('chat:room#$roomId');
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final chat = context.watch<ChatProvider>();
    final room = chat.activeRoom;
    final unread = chat.unreadCount;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e3a5f),
        title: Row(
          children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(room?.displayTitle ?? 'Yordam', style: const TextStyle(color: Colors.white, fontSize: 16)),
              Text(auth.user?.displayName ?? '', style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
            if (unread > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(10)),
                child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
              ),
            ],
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.call, color: Colors.white),
            tooltip: "Qo'ng'iroq",
            onPressed: _callId == null ? _startCall : null,
          ),
          IconButton(icon: const Icon(Icons.logout, color: Colors.white), onPressed: _logout),
        ],
      ),
      body: !_initialized
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
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
              if (_opTyping)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Operator yozmoqda...', style: TextStyle(color: Colors.grey, fontSize: 12, fontStyle: FontStyle.italic)),
                  ),
                ),
              _buildInput(chat, room?.id),
            ]),
    );
  }

  Widget _buildInput(ChatProvider chat, String? roomId) {
    if (_recording) return _buildRecordingBar(chat, roomId);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4)],
      ),
      child: Column(children: [
        if (_selectedFile != null) _buildFilePreview(),
        if (_uploadProgress != null) LinearProgressIndicator(
          value: _uploadProgress! < 1 ? _uploadProgress : null,
          backgroundColor: Colors.grey.shade200,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(children: [
            IconButton(
              icon: const Icon(Icons.attach_file, color: Color(0xFF1e3a5f)),
              onPressed: _uploadProgress == null ? _pickFile : null,
            ),
            Expanded(
              child: TextField(
                controller: _msgCtrl,
                decoration: const InputDecoration(hintText: 'Xabar yozing...', border: InputBorder.none),
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
            if (kIsWeb)
              GestureDetector(
                onLongPressStart: (_) => _startRecording(),
                onLongPressEnd: (_) => _stopRecordingAndSend(chat, roomId),
                child: const Tooltip(
                  message: 'Ovozli xabar (bosib turing)',
                  child: Icon(Icons.mic, color: Color(0xFF1e3a5f), size: 22),
                ),
              ),
            const SizedBox(width: 4),
            IconButton(
              icon: const Icon(Icons.send, color: Color(0xFF1e3a5f)),
              onPressed: _uploadProgress == null ? () => _send(chat, roomId) : null,
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _buildRecordingBar(ChatProvider chat, String? roomId) {
    final m = _recordingSeconds ~/ 60;
    final s = _recordingSeconds % 60;
    final duration = '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: Colors.red.shade50,
      child: Row(children: [
        Container(width: 10, height: 10, decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Text('Yozilmoqda $duration', style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w500)),
        const Spacer(),
        TextButton.icon(
          onPressed: _cancelRecording,
          icon: const Icon(Icons.close, color: Colors.grey),
          label: const Text('Bekor', style: TextStyle(color: Colors.grey)),
        ),
        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
          onPressed: () => _stopRecordingAndSend(chat, roomId),
          icon: const Icon(Icons.stop, color: Colors.white, size: 18),
          label: const Text('Yuborish', style: TextStyle(color: Colors.white)),
        ),
      ]),
    );
  }

  Widget _buildFilePreview() {
    final file = _selectedFile!;
    final isImage = file.bytes != null &&
        ['jpg', 'jpeg', 'png', 'gif', 'webp'].contains(file.extension?.toLowerCase());
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 0),
      child: Row(children: [
        if (isImage)
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(file.bytes!, width: 56, height: 56, fit: BoxFit.cover),
          )
        else
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.insert_drive_file, size: 32, color: Colors.grey),
          ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(file.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          Text('${(file.size / 1024).toStringAsFixed(1)} KB', style: const TextStyle(fontSize: 11, color: Colors.grey)),
        ])),
        IconButton(icon: const Icon(Icons.close, size: 18), onPressed: _clearFile),
      ]),
    );
  }

  Future<void> _logout() async {
    _typingTimer?.cancel();
    _recordingTimer?.cancel();
    VoiceRecorderService().cancel();
    CentrifugeService().disconnect();
    context.read<ChatProvider>().clear();
    await context.read<AuthProvider>().logout();
    if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
  }
}

// ── Message Bubble ────────────────────────────────────────────────────────────

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
            decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(12)),
            child: Text(message.localizedContent('uz'),
                style: const TextStyle(fontSize: 12, color: Colors.grey, fontStyle: FontStyle.italic)),
          ),
        ),
      );
    }

    final isMedia = message.type != 'text';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: isOwn ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
            child: Container(
              padding: EdgeInsets.symmetric(
                  horizontal: isMedia ? 6 : 14, vertical: isMedia ? 6 : 10),
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
                  if (isMedia && message.content != null)
                    _MediaContent(attachmentId: message.content!, type: message.type, isOwn: isOwn)
                  else
                    Text(message.content ?? '',
                        style: TextStyle(color: isOwn ? Colors.white : Colors.black87, fontSize: 15)),
                  const SizedBox(height: 2),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(_fmt(message.createdAt),
                        style: TextStyle(fontSize: 10, color: isOwn ? Colors.white60 : Colors.grey)),
                    if (isOwn) ...[
                      const SizedBox(width: 3),
                      Icon(Icons.done_all, size: 12, color: Colors.white60),
                    ],
                  ]),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fmt(DateTime dt) =>
      '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
}

class _MediaContent extends StatefulWidget {
  final String attachmentId;
  final String type;
  final bool isOwn;
  const _MediaContent({required this.attachmentId, required this.type, required this.isOwn});
  @override
  State<_MediaContent> createState() => _MediaContentState();
}

class _MediaContentState extends State<_MediaContent> {
  AttachmentInfo? _info;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await MediaService().getAttachment(widget.attachmentId);
      if (mounted) setState(() => _info = info);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) return Text('Yuklanmadi', style: TextStyle(color: widget.isOwn ? Colors.white60 : Colors.grey, fontSize: 12));
    if (_info == null) return const SizedBox(width: 120, height: 40, child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
    final info = _info!;
    if (info.isImage) return _buildImage(info);
    if (info.isAudio) return _buildAudio(info);
    return _buildFile(info);
  }

  Widget _buildImage(AttachmentInfo info) => GestureDetector(
    onTap: () => _open(info.url),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.network(info.url, width: 220, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, color: Colors.grey)),
    ),
  );

  Widget _buildAudio(AttachmentInfo info) => GestureDetector(
    onTap: () => _open(info.url),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.play_circle_fill, color: widget.isOwn ? Colors.white : const Color(0xFF1e3a5f), size: 32),
      const SizedBox(width: 8),
      Flexible(child: Text(info.fileName, overflow: TextOverflow.ellipsis,
          style: TextStyle(color: widget.isOwn ? Colors.white : Colors.black87, fontSize: 13))),
    ]),
  );

  Widget _buildFile(AttachmentInfo info) {
    final icon = info.mimeType.contains('pdf') ? Icons.picture_as_pdf
        : info.mimeType.contains('word') ? Icons.article
        : Icons.insert_drive_file;
    return GestureDetector(
      onTap: () => _open(info.url),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: widget.isOwn ? Colors.white70 : const Color(0xFF1e3a5f), size: 28),
        const SizedBox(width: 8),
        Flexible(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(info.fileName, overflow: TextOverflow.ellipsis,
              style: TextStyle(color: widget.isOwn ? Colors.white : Colors.black87, fontSize: 13, fontWeight: FontWeight.w600)),
          Text('${(info.sizeBytes / 1024).toStringAsFixed(1)} KB',
              style: TextStyle(color: widget.isOwn ? Colors.white60 : Colors.grey, fontSize: 11)),
        ])),
        Icon(Icons.download, size: 18, color: widget.isOwn ? Colors.white60 : Colors.grey),
      ]),
    );
  }

  void _open(String url) {
    if (!kIsWeb) return;
    try { html.window.open(url, '_blank'); } catch (_) {}
  }
}
