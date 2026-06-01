// Flutter web only.
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:js_util' as js_util;

/// Web Audio tone generator — no audio files needed.
/// Injects JS via ScriptElement, calls window functions via dart:js_util.
/// dart:js_util is NOT deprecated in Dart 3.x and works with html.window.
class RingtoneService {
  static final RingtoneService _instance = RingtoneService._internal();
  factory RingtoneService() => _instance;
  RingtoneService._internal();

  bool _injected = false;

  void _ensureInjected() {
    if (_injected) return;
    _injected = true;
    try {
      html.document.head!.append(
        html.ScriptElement()
          ..type = 'text/javascript'
          ..text = r'''
(function() {
  var ctx, osc, gain, tmr, stopping = false;

  function getCtx() {
    if (!ctx || ctx.state === 'closed')
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(function(){});
    return ctx;
  }

  function stopNode() {
    if (osc) { try { osc.stop(); } catch(e){} osc.disconnect(); osc = null; }
    if (gain) { gain.disconnect(); gain = null; }
  }

  function stopAll() {
    stopping = true;
    if (tmr) { clearTimeout(tmr); tmr = null; }
    stopNode();
  }

  function tone(freq, vol, durMs, cb) {
    if (stopping) return;
    var c = getCtx(); stopNode();
    try {
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine'; o.frequency.value = freq;
      var t = c.currentTime, d = durMs / 1000;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.010);
      g.gain.setValueAtTime(vol, t + d - 0.010);
      g.gain.linearRampToValueAtTime(0, t + d);
      o.start(t); o.stop(t + d);
      osc = o; gain = g;
      o.onended = function() { osc = null; gain = null; if (!stopping && cb) cb(); };
    } catch(e) {}
  }

  function wait(durMs, cb) {
    if (stopping) return;
    tmr = setTimeout(function() { tmr = null; if (!stopping && cb) cb(); }, durMs);
  }

  // Expose as flat window functions so dart:js_util.callMethod works easily.
  window._novaRingback = function() {
    stopAll(); stopping = false;
    function cycle() { tone(425, 0.15, 1000, function() { wait(4000, cycle); }); }
    cycle();
  };

  window._novaRingtone = function() {
    stopAll(); stopping = false;
    function ring() {
      tone(440, 0.20, 400, function() {
        wait(80, function() {
          tone(480, 0.20, 400, function() {
            wait(80, function() { wait(2000, ring); });
          });
        });
      });
    }
    ring();
  };

  window._novaStopTone = function() { stopAll(); };
})();
''',
      );
    } catch (_) {}
  }

  void startRingback() {
    _ensureInjected();
    try { js_util.callMethod(html.window, '_novaRingback', []); } catch (_) {}
  }

  void startRingtone() {
    _ensureInjected();
    try { js_util.callMethod(html.window, '_novaRingtone', []); } catch (_) {}
  }

  void stopAll() {
    if (!_injected) return;
    try { js_util.callMethod(html.window, '_novaStopTone', []); } catch (_) {}
  }
}
