import 'package:centrifuge/centrifuge.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../services/api_service.dart';

class CentrifugeService {
  static final CentrifugeService _instance = CentrifugeService._();
  factory CentrifugeService() => _instance;
  CentrifugeService._();

  Client? _client;
  final Map<String, Subscription> _subs = {};

  Future<void> connect() async {
    if (_client?.state == State.connected) return;

    final token = await _getToken();
    _client = createClient(
      Config.centrifugoUrl,
      ClientConfig(
        token: token ?? '',
        getToken: (_) async => await _getToken() ?? '',
      ),
    );

    await _client!.connect();
  }

  Future<String?> _getToken() async {
    try {
      final res = await ApiService().post('/auth/centrifugo/token');
      return res['token'];
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('access_token');
    }
  }

  Future<Subscription> subscribe(
    String channel,
    void Function(PublicationEvent) onEvent,
  ) async {
    if (_subs.containsKey(channel)) return _subs[channel]!;

    String? subToken;
    try {
      final res = await ApiService().post('/auth/centrifugo/subscribe', data: {'channel': channel});
      subToken = res['token'];
    } catch (_) {}

    final existing = _client!.getSubscription(channel);
    final sub = existing ?? _client!.newSubscription(
      channel,
      SubscriptionConfig(token: subToken ?? ''),
    );
    sub.publication.listen(onEvent);
    if (existing == null) await sub.subscribe();
    _subs[channel] = sub;
    return sub;
  }

  void unsubscribe(String channel) {
    _subs[channel]?.unsubscribe();
    _subs.remove(channel);
  }

  void disconnect() {
    for (final sub in _subs.values) {
      sub.unsubscribe();
    }
    _subs.clear();
    _client?.disconnect();
    _client = null;
  }
}
