import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

class ApiService {
  static final ApiService _instance = ApiService._();
  factory ApiService() => _instance;
  ApiService._();

  late final Dio _dio;

  void init() {
    _dio = Dio(BaseOptions(
      baseUrl: Config.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (err, handler) async {
        if (err.response?.statusCode == 401) {
          final refreshed = await _refresh();
          if (refreshed) {
            final prefs = await SharedPreferences.getInstance();
            final token = prefs.getString('access_token');
            err.requestOptions.headers['Authorization'] = 'Bearer $token';
            final res = await _dio.fetch(err.requestOptions);
            return handler.resolve(res);
          }
        }
        handler.next(err);
      },
    ));
  }

  Future<bool> _refresh() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final refreshToken = prefs.getString('refresh_token');
      if (refreshToken == null) return false;
      final res = await Dio().post('${Config.baseUrl}/auth/refresh',
          data: {'refreshToken': refreshToken});
      await prefs.setString('access_token', res.data['accessToken']);
      await prefs.setString('refresh_token', res.data['refreshToken']);
      return true;
    } catch (_) {
      return false;
    }
  }

  Dio get dio => _dio;

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? params}) async {
    final res = await _dio.get(path, queryParameters: params);
    return res.data;
  }

  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    final res = await _dio.post(path, data: data);
    return res.data;
  }
}
