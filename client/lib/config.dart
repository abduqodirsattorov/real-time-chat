class Config {
  static const String baseUrl = 'http://localhost:80/api/v1';
  static const String centrifugoUrl = 'ws://localhost:80/connection/websocket';
  static const String livekitUrl = 'ws://localhost:7880';

  // Mijoz qaysi productga tegishli — admin paneldan product ID ni oling
  // null bo'lsa default "Asosiy" product ishlatiladi
  // TEST: boshqa product uchun shu yerga product UUID yozing
  static const String? productId = '00000000-0000-0000-0000-000000000002';
}
