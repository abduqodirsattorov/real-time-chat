import { api } from './client';

export const ALLOWED_TYPES: Record<string, { maxMb: number; label: string }> = {
  'image/jpeg':      { maxMb: 10,  label: 'JPG' },
  'image/png':       { maxMb: 10,  label: 'PNG' },
  'image/gif':       { maxMb: 10,  label: 'GIF' },
  'image/webp':      { maxMb: 10,  label: 'WEBP' },
  'video/mp4':       { maxMb: 100, label: 'MP4' },
  'video/webm':      { maxMb: 100, label: 'WEBM' },
  'audio/mpeg':      { maxMb: 25,  label: 'MP3' },
  'audio/ogg':       { maxMb: 25,  label: 'OGG' },
  'audio/wav':       { maxMb: 25,  label: 'WAV' },
  'audio/webm':      { maxMb: 25,  label: 'WEBA' },
  'application/pdf': { maxMb: 25,  label: 'PDF' },
  'application/msword': { maxMb: 25, label: 'DOC' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { maxMb: 25, label: 'DOCX' },
};

export interface PresignRes {
  uploadId: string;
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

export interface Attachment {
  id: string;
  storageKey: string;
  mimeType: string;
  fileName: string;
  sizeBytes: string;
  url: string;
}

export const mediaApi = {
  presign(fileName: string, mimeType: string, fileSize: number): Promise<PresignRes> {
    return api.post('/media/presign', { fileName, mimeType, fileSize }).then((r) => r.data);
  },

  async uploadToMinio(uploadUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(file);
    });
  },

  confirm(uploadId: string, extras?: { width?: number; height?: number; durationMs?: number }): Promise<Attachment> {
    return api.post('/media/confirm', { uploadId, ...extras }).then((r) => r.data);
  },

  getUrl(attachmentId: string): Promise<Attachment> {
    return api.get(`/media/${attachmentId}`).then((r) => r.data);
  },

  getThumbnailUrl(attachmentId: string): string {
    return `/api/v1/media/${attachmentId}/thumbnail`;
  },
};

export function validateFile(file: File): string | null {
  const info = ALLOWED_TYPES[file.type];
  if (!info) return `Fayl turi qo'llab-quvvatlanmaydi: ${file.type}`;
  if (file.size > info.maxMb * 1024 * 1024) return `Fayl hajmi ${info.maxMb}MB dan oshmasligi kerak`;
  return null;
}

export function msgTypeFromMime(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function formatBytes(bytes: string | number): string {
  const b = Number(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
