class Room {
  final String id;
  final String type;
  final String status;
  final String? title;
  final String? customerId;
  final String? operatorId;
  final DateTime? lastMessageAt;
  final DateTime createdAt;

  const Room({
    required this.id,
    required this.type,
    required this.status,
    this.title,
    this.customerId,
    this.operatorId,
    this.lastMessageAt,
    required this.createdAt,
  });

  factory Room.fromJson(Map<String, dynamic> j) => Room(
        id: j['id'],
        type: j['type'] ?? 'support',
        status: j['status'] ?? 'pending',
        title: j['title'],
        customerId: j['customerId'],
        operatorId: j['operatorId'],
        lastMessageAt: j['lastMessageAt'] != null ? DateTime.parse(j['lastMessageAt']) : null,
        createdAt: DateTime.parse(j['createdAt']),
      );

  String get displayTitle => title ?? 'Yordam so\'rovi';
}
