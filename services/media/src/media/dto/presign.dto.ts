import { IsString, IsNotEmpty, IsNumber, IsOptional, IsIn } from 'class-validator';

export const ALLOWED_MIME_TYPES: Record<string, { maxBytes: number; ext: string }> = {
  'image/jpeg':      { maxBytes: 10 * 1024 * 1024, ext: 'jpg' },
  'image/png':       { maxBytes: 10 * 1024 * 1024, ext: 'png' },
  'image/gif':       { maxBytes: 10 * 1024 * 1024, ext: 'gif' },
  'image/webp':      { maxBytes: 10 * 1024 * 1024, ext: 'webp' },
  'video/mp4':       { maxBytes: 100 * 1024 * 1024, ext: 'mp4' },
  'video/webm':      { maxBytes: 100 * 1024 * 1024, ext: 'webm' },
  'audio/mpeg':      { maxBytes: 25 * 1024 * 1024, ext: 'mp3' },
  'audio/ogg':       { maxBytes: 25 * 1024 * 1024, ext: 'ogg' },
  'audio/wav':       { maxBytes: 25 * 1024 * 1024, ext: 'wav' },
  'audio/webm':      { maxBytes: 25 * 1024 * 1024, ext: 'weba' },
  'application/pdf': { maxBytes: 25 * 1024 * 1024, ext: 'pdf' },
  'application/msword': { maxBytes: 25 * 1024 * 1024, ext: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    maxBytes: 25 * 1024 * 1024, ext: 'docx',
  },
};

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsIn(Object.keys(ALLOWED_MIME_TYPES))
  mimeType: string;

  @IsNumber()
  fileSize: number;
}
