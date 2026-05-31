import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import '../services/api_service.dart';

class AttachmentInfo {
  final String id;
  final String url;
  final String mimeType;
  final String fileName;
  final int sizeBytes;

  AttachmentInfo({
    required this.id,
    required this.url,
    required this.mimeType,
    required this.fileName,
    required this.sizeBytes,
  });

  bool get isImage => mimeType.startsWith('image/');
  bool get isVideo => mimeType.startsWith('video/');
  bool get isAudio => mimeType.startsWith('audio/');

  String get msgType {
    if (isImage) return 'image';
    if (isVideo) return 'video';
    if (isAudio) return 'audio';
    return 'file';
  }
}

class MediaService {
  static final MediaService _instance = MediaService._();
  factory MediaService() => _instance;
  MediaService._();

  static const Map<String, String> _extToMime = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp',
    'mp4': 'video/mp4', 'webm': 'video/webm',
    'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav',
    'pdf': 'application/pdf', 'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  final _cache = <String, AttachmentInfo>{};

  Future<PlatformFile?> pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      withData: true,
      allowedExtensions: _extToMime.keys.toList(),
      type: FileType.custom,
    );
    return result?.files.firstOrNull;
  }

  Future<AttachmentInfo> upload(
    PlatformFile file, {
    void Function(double)? onProgress,
  }) async {
    final bytes = file.bytes;
    if (bytes == null) throw Exception('Fayl o\'qilmadi');

    final ext = file.extension?.toLowerCase() ?? '';
    final mimeType = _extToMime[ext] ?? 'application/octet-stream';

    // 1. Presign
    final presign = await ApiService().post('/media/presign', data: {
      'fileName': file.name,
      'mimeType': mimeType,
      'fileSize': bytes.length,
    });
    final uploadId = presign['uploadId'] as String;
    final uploadUrl = presign['uploadUrl'] as String;

    // 2. PUT to MinIO (presigned URL — no auth needed)
    final dio = Dio();
    await dio.put(
      uploadUrl,
      data: bytes,
      options: Options(
        contentType: mimeType,
        headers: {'Content-Length': bytes.length.toString()},
        sendTimeout: const Duration(minutes: 5),
        receiveTimeout: const Duration(minutes: 1),
      ),
      onSendProgress: (sent, total) {
        if (total > 0) onProgress?.call(sent / total);
      },
    );

    // 3. Confirm
    final confirm = await ApiService().post('/media/confirm', data: {'uploadId': uploadId});

    return AttachmentInfo(
      id: confirm['id'] as String,
      url: confirm['url'] as String,
      mimeType: confirm['mimeType'] as String? ?? mimeType,
      fileName: confirm['fileName'] as String? ?? file.name,
      sizeBytes: int.tryParse(confirm['sizeBytes']?.toString() ?? '0') ?? bytes.length,
    );
  }

  Future<AttachmentInfo> getAttachment(String attachmentId) async {
    if (_cache.containsKey(attachmentId)) return _cache[attachmentId]!;
    final res = await ApiService().get('/media/$attachmentId');
    final info = AttachmentInfo(
      id: res['id'] as String,
      url: res['url'] as String,
      mimeType: res['mimeType'] as String? ?? '',
      fileName: res['fileName'] as String? ?? '',
      sizeBytes: int.tryParse(res['sizeBytes']?.toString() ?? '0') ?? 0,
    );
    _cache[attachmentId] = info;
    return info;
  }
}
