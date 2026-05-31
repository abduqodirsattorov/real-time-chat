import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/chat_provider.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';
import 'screens/login_screen.dart';
import 'screens/chat_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ApiService().init();
  await NotificationService().requestPermission();

  final auth = AuthProvider();
  await auth.init();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: const NovaApp(),
    ),
  );
}

class NovaApp extends StatelessWidget {
  const NovaApp({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return MaterialApp(
      title: 'Nova Chat',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1e3a5f)),
        useMaterial3: true,
      ),
      home: auth.isLoggedIn ? const ChatScreen() : const LoginScreen(),
    );
  }
}
