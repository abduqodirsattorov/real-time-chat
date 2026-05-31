// ignore: avoid_web_libraries_in_flutter
import 'dart:async';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';

class VoiceRecorderService {
  static final _instance = VoiceRecorderService._();
  factory VoiceRecorderService() => _instance;
  VoiceRecorderService._();

  html.MediaRecorder? _recorder;
  html.MediaStream? _stream;
  final _chunks = <html.Blob>[];
  bool _recording = false;

  bool get isRecording => _recording;

  Future<void> start() async {
    if (!kIsWeb) throw UnsupportedError('Faqat web');
    _chunks.clear();
    final constraints = {'audio': true};
    _stream = await html.window.navigator.mediaDevices
        ?.getUserMedia(constraints);
    if (_stream == null) throw Exception("Mikrofon ruxsati berilmadi");

    _recorder = html.MediaRecorder(_stream!, {'mimeType': 'audio/webm'});
    _recorder!.addEventListener('dataavailable', (e) {
      final blob = (e as html.BlobEvent).data;
      if (blob != null && blob.size > 0) _chunks.add(blob);
    });
    _recorder!.start(250);
    _recording = true;
  }

  Future<PlatformFile?> stop() async {
    if (!kIsWeb || _recorder == null || !_recording) return null;

    final completer = Completer<PlatformFile?>();
    _recorder!.addEventListener('stop', (_) async {
      final blob = html.Blob(_chunks, 'audio/webm');
      final reader = html.FileReader();
      reader.readAsArrayBuffer(blob);
      reader.onLoadEnd.listen((_) {
        try {
          final buf = reader.result as ByteBuffer;
          final bytes = buf.asUint8List();
          final name = 'voice_${DateTime.now().millisecondsSinceEpoch}.webm';
          completer.complete(PlatformFile(
            name: name,
            size: bytes.length,
            bytes: bytes,
          ));
        } catch (e) {
          completer.completeError(e);
        }
      });
      _cleanup();
    });
    _recorder!.stop();
    return completer.future;
  }

  void cancel() {
    _recorder?.stop();
    _cleanup();
  }

  void _cleanup() {
    _stream?.getTracks().forEach((t) => t.stop());
    _stream = null;
    _recorder = null;
    _recording = false;
    _chunks.clear();
  }
}
