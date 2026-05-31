import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _loading = false;
  String? _error;

  User? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString('access_token') != null) {
      await loadMe();
    }
  }

  Future<bool> sendOtp(String phone) async {
    _loading = true; _error = null; notifyListeners();
    try {
      await ApiService().post('/auth/login', data: {'phone': phone});
      return true;
    } catch (e) {
      _error = _extractError(e);
      return false;
    } finally {
      _loading = false; notifyListeners();
    }
  }

  Future<bool> verifyOtp(String phone, String otp) async {
    _loading = true; _error = null; notifyListeners();
    try {
      final res = await ApiService().post('/auth/otp/verify', data: {'phone': phone, 'otp': otp});
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('access_token', res['accessToken']);
      await prefs.setString('refresh_token', res['refreshToken']);
      await loadMe();
      return true;
    } catch (e) {
      _error = _extractError(e);
      return false;
    } finally {
      _loading = false; notifyListeners();
    }
  }

  Future<void> loadMe() async {
    try {
      final res = await ApiService().get('/auth/me');
      _user = User.fromJson(res);
      notifyListeners();
    } catch (_) {
      await logout();
    }
  }

  Future<void> logout() async {
    try { await ApiService().post('/auth/logout'); } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
    _user = null;
    notifyListeners();
  }

  String _extractError(dynamic e) {
    if (e is Exception) return e.toString().replaceFirst('Exception: ', '');
    return 'Xato yuz berdi';
  }
}
