// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'package:flutter/foundation.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  bool _permissionGranted = false;

  Future<void> requestPermission() async {
    if (!kIsWeb) return;
    try {
      final permission = await html.Notification.requestPermission();
      _permissionGranted = permission == 'granted';
    } catch (_) {}
  }

  void notifyMessage(String body) {
    _showBrowser('Nova Chat — Yangi xabar', body: body);
  }

  void notifyIncomingCall() {
    _showBrowser("Nova Chat — Kiruvchi qo'ng'iroq",
        body: "Operator siz bilan bog'lanmoqda...");
  }

  void _showBrowser(String title, {String? body}) {
    if (!kIsWeb || !_permissionGranted) return;
    try {
      html.Notification(title, body: body, icon: '/favicon.png');
    } catch (_) {}
  }
}
