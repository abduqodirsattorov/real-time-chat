import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../models/room.dart';
import '../models/message.dart';
import '../services/api_service.dart';

class ChatProvider extends ChangeNotifier {
  Room? _activeRoom;
  List<Message> _messages = [];
  bool _loadingMessages = false;
  String? _supportRoomId;
  int _unreadCount = 0;

  Room? get activeRoom => _activeRoom;
  List<Message> get messages => _messages;
  bool get loadingMessages => _loadingMessages;
  String? get supportRoomId => _supportRoomId;
  int get unreadCount => _unreadCount;

  void incrementUnread() {
    _unreadCount++;
    notifyListeners();
  }

  void clearUnread() {
    if (_unreadCount == 0) return;
    _unreadCount = 0;
    notifyListeners();
  }

  void addMessage(Message msg) {
    if (!_messages.any((m) => m.id == msg.id)) {
      _messages.add(msg);
      _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      notifyListeners();
    }
  }

  Future<Room?> getOrCreateSupportRoom() async {
    try {
      final res = await ApiService().post('/support/request', data: {'subject': 'Yordam kerak'});
      _supportRoomId = res['roomId'] ?? res['id'];
      return await loadRoom(_supportRoomId!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        final data = e.response?.data;
        if (data is Map) {
          final roomId = data['roomId'] ?? data['id'];
          if (roomId != null) {
            _supportRoomId = roomId as String;
            return await loadRoom(_supportRoomId!);
          }
        }
        try {
          final rooms = await ApiService().get('/rooms');
          final items = rooms['items'] as List? ?? [];
          if (items.isNotEmpty) {
            _supportRoomId = items.first['id'] as String;
            return Room.fromJson(items.first as Map<String, dynamic>);
          }
        } catch (_) {}
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Room?> loadRoom(String roomId) async {
    try {
      final res = await ApiService().get('/rooms/$roomId');
      _activeRoom = Room.fromJson(res);
      notifyListeners();
      return _activeRoom;
    } catch (_) { return null; }
  }

  Future<void> loadMessages(String roomId) async {
    _loadingMessages = true; notifyListeners();
    try {
      final res = await ApiService().get('/rooms/$roomId/messages', params: {'limit': '50'});
      final items = res['items'] as List? ?? [];
      _messages = items.map((j) => Message.fromJson(j)).toList();
      _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    } catch (_) {}
    _loadingMessages = false; notifyListeners();
  }

  Future<Message?> sendMessage(String roomId, String content, {String type = 'text'}) async {
    try {
      final res = await ApiService().post('/rooms/$roomId/messages',
          data: {'type': type, 'content': content});
      final msg = Message.fromJson(res);
      addMessage(msg);
      return msg;
    } catch (_) { return null; }
  }

  Future<void> sendTyping(String roomId) async {
    try {
      await ApiService().post('/rooms/$roomId/typing', data: {'typing': true});
    } catch (_) {}
  }

  void clear() {
    _activeRoom = null;
    _messages = [];
    _supportRoomId = null;
    _unreadCount = 0;
    notifyListeners();
  }
}
