class Message {
  final String id;
  final String roomId;
  final String senderId;
  final String type;
  final String? content;
  final DateTime createdAt;

  const Message({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.type,
    this.content,
    required this.createdAt,
  });

  factory Message.fromJson(Map<String, dynamic> j) => Message(
        id: j['id'],
        roomId: j['roomId'],
        senderId: j['senderId'],
        type: j['type'] ?? 'text',
        content: j['content'],
        createdAt: DateTime.parse(j['createdAt']),
      );

  bool get isSystem => type == 'system';

  String localizedContent(String locale) {
    if (!isSystem || content == null) return content ?? '';
    try {
      // System messages: {"uz":"...","ru":"..."}
      if (content!.startsWith('{')) {
        final parts = RegExp(r'"(\w{2})":"([^"]*)"').allMatches(content!);
        for (final m in parts) {
          if (m.group(1) == locale) return m.group(2)!;
        }
        return parts.first.group(2) ?? content!;
      }
    } catch (_) {}
    return content!;
  }
}
