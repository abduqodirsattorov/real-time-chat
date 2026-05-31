class User {
  final String id;
  final String phone;
  final String? fullName;
  final String role;

  const User({required this.id, required this.phone, this.fullName, required this.role});

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'],
        phone: j['phone'],
        fullName: j['fullName'],
        role: j['role'] ?? 'customer',
      );

  String get displayName => fullName?.isNotEmpty == true ? fullName! : phone;
}
