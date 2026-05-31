import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'chat_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneCtrl = TextEditingController(text: '+998');
  final _otpCtrl = TextEditingController();
  int _step = 1;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: const Color(0xFF1e3a5f),
      body: Center(
        child: Card(
          margin: const EdgeInsets.all(24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.chat_bubble_rounded, size: 56, color: Color(0xFF1e3a5f)),
                  const SizedBox(height: 12),
                  const Text('Nova Chat',
                      style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Color(0xFF1e3a5f))),
                  const Text('Mijoz portali', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 32),

                  if (_step == 1) ...[
                    TextField(
                      controller: _phoneCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Telefon raqam',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.phone),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1e3a5f),
                            padding: const EdgeInsets.symmetric(vertical: 14)),
                        onPressed: auth.loading ? null : _sendOtp,
                        child: auth.loading
                            ? const CircularProgressIndicator(color: Colors.white)
                            : const Text('Kod yuborish', style: TextStyle(color: Colors.white, fontSize: 16)),
                      ),
                    ),
                  ] else ...[
                    TextField(
                      controller: _otpCtrl,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: const InputDecoration(
                        labelText: 'SMS kod',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.lock_outline),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1e3a5f),
                            padding: const EdgeInsets.symmetric(vertical: 14)),
                        onPressed: auth.loading ? null : _verifyOtp,
                        child: auth.loading
                            ? const CircularProgressIndicator(color: Colors.white)
                            : const Text('Kirish', style: TextStyle(color: Colors.white, fontSize: 16)),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() { _step = 1; _otpCtrl.clear(); }),
                      child: const Text('Orqaga'),
                    ),
                  ],

                  if (auth.error != null) ...[
                    const SizedBox(height: 12),
                    Text(auth.error!, style: const TextStyle(color: Colors.red)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _sendOtp() async {
    final auth = context.read<AuthProvider>();
    final ok = await auth.sendOtp(_phoneCtrl.text.trim());
    if (ok && mounted) setState(() => _step = 2);
  }

  Future<void> _verifyOtp() async {
    final auth = context.read<AuthProvider>();
    final ok = await auth.verifyOtp(_phoneCtrl.text.trim(), _otpCtrl.text.trim());
    if (ok && mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ChatScreen()),
      );
    }
  }
}
