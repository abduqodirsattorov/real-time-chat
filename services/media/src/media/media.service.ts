import {
  Injectable, BadRequestException, NotFoundException,
  ForbiddenException, Logger, OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MinioService } from '../minio/minio.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { PresignDto, ALLOWED_MIME_TYPES } from './dto/presign.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fileType from 'file-type';

const UPLOAD_TTL = 3600;
const VOICE_MAX_BYTES = 10 * 1024 * 1024;
const VOICE_MAX_MS = 5 * 60 * 1000;

const VOICE_MIMES = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm']);

interface UploadState {
  uploaderId: string;
  storageKey: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  uploadedAt: number;
}

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly minio: MinioService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  async onModuleInit() {
    // Start consuming thumbnail requests
    await this.rabbitmq.consume('media.thumbnail', 'media.thumbnail', async (msg) => {
      await this.processThumbnail(msg.attachment_id).catch((e) =>
        this.logger.warn({ event: 'thumbnail_fail', err: e?.message }),
      );
    });
  }

  // ── QISM 2: Presign ────────────────────────────────────────────────────────

  async presign(user: JwtUser, dto: PresignDto) {
    const config = ALLOWED_MIME_TYPES[dto.mimeType];
    if (!config) throw new BadRequestException(`MIME turi ruxsat etilmagan: ${dto.mimeType}`);
    if (dto.fileSize > config.maxBytes) {
      throw new BadRequestException(
        `Fayl hajmi oshib ketdi. Maksimum: ${config.maxBytes / 1024 / 1024}MB`,
      );
    }

    const safeFileName = this.sanitizeFileName(dto.fileName);
    const uploadId = uuidv4();
    const now = new Date();
    const storageKey = this.buildStorageKey(now, uploadId, config.ext);

    const state: UploadState = {
      uploaderId: user.sub,
      storageKey,
      mimeType: dto.mimeType,
      fileName: safeFileName,
      fileSize: dto.fileSize,
      uploadedAt: Date.now(),
    };

    await this.redis.set(`media:upload:${uploadId}`, JSON.stringify(state), UPLOAD_TTL);

    const uploadUrl = await this.minio.presignedPutUrl(storageKey, dto.mimeType);

    this.logger.log({ event: 'presign_created', uploadId, userId: user.sub, mimeType: dto.mimeType });

    return { uploadId, uploadUrl, storageKey, expiresIn: UPLOAD_TTL };
  }

  // ── QISM 2: Confirm ───────────────────────────────────────────────────────

  async confirm(user: JwtUser, dto: ConfirmDto) {
    const stateRaw = await this.redis.get(`media:upload:${dto.uploadId}`);
    if (!stateRaw) throw new NotFoundException('Upload session topilmadi yoki muddati o\'tdi');

    const state: UploadState = JSON.parse(stateRaw);
    if (state.uploaderId !== user.sub) throw new ForbiddenException();

    // Verify file actually uploaded
    let stat: any;
    try {
      stat = await this.minio.statObject(state.storageKey);
    } catch {
      throw new BadRequestException('Fayl MinIO\'ga yuklanmagan');
    }

    // Magic bytes check
    const buf = await this.minio.getObject(state.storageKey);
    let detected: any = null;
    try { detected = await fileType.fromBuffer(buf); } catch {}
    if (detected && detected.mime !== state.mimeType) {
      this.logger.warn({
        event: 'mime_mismatch',
        declared: state.mimeType,
        detected: detected.mime,
        uploadId: dto.uploadId,
      });
      // ClamAV stub — log only, do not block
    }

    // ClamAV stub
    this.logger.log({ event: 'clamav_stub', storageKey: state.storageKey, note: 'scan_skipped' });

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: state.uploaderId,
        storageKey: state.storageKey,
        mimeType: state.mimeType,
        fileName: state.fileName,
        sizeBytes: BigInt(stat.size ?? state.fileSize),
        width: dto.width ?? null,
        height: dto.height ?? null,
        durationMs: dto.durationMs ?? null,
      },
    });

    await this.redis.del(`media:upload:${dto.uploadId}`);

    // Publish event
    await this.rabbitmq.publish('media.uploaded', {
      attachment_id: attachment.id,
      uploader_id: attachment.uploaderId,
      storage_key: attachment.storageKey,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes.toString(),
      timestamp: Date.now(),
    });

    // Trigger thumbnail generation
    if (this.needsThumbnail(state.mimeType)) {
      await this.rabbitmq.publish('media.thumbnail', {
        attachment_id: attachment.id,
      });
    }

    this.logger.log({ event: 'media_confirmed', attachmentId: attachment.id, userId: user.sub });

    return { ...attachment, sizeBytes: attachment.sizeBytes.toString() };
  }

  // ── QISM 2: Get attachment ────────────────────────────────────────────────

  async getAttachment(user: JwtUser, id: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Attachment topilmadi');

    await this.verifyAttachmentAccess(user, att);

    const url = await this.minio.presignedGetUrl(att.storageKey);
    return { ...att, sizeBytes: att.sizeBytes.toString(), url };
  }

  // ── QISM 2: Get thumbnail ────────────────────────────────────────────────

  async getThumbnail(user: JwtUser, id: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Attachment topilmadi');

    await this.verifyAttachmentAccess(user, att);

    if (!att.thumbnailKey) {
      // Fall back to original if no thumbnail
      const url = await this.minio.presignedGetUrl(att.storageKey);
      return { url, isThumbnail: false };
    }

    const url = await this.minio.presignedGetUrl(att.thumbnailKey);
    return { url, isThumbnail: true };
  }

  private async verifyAttachmentAccess(user: JwtUser, att: any) {
    const isStaff = ['operator', 'supervisor', 'admin'].includes(user.role);
    if (isStaff) return;

    if (att.uploaderId === user.sub) return;

    this.logger.warn({ event: 'unauthorized_attachment_access', userId: user.sub, attachmentId: att.id });
    throw new ForbiddenException('Ushbu faylga kirish huquqingiz yo\'q');
  }

  // ── QISM 5: Voice upload ──────────────────────────────────────────────────

  async uploadVoice(user: JwtUser, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    if (file.size > VOICE_MAX_BYTES) throw new BadRequestException('Ovoz xabari 10MB dan oshmasligi kerak');

    if (!VOICE_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Faqat audio fayllar ruxsat etilgan');
    }

    // Magic bytes check
    let detected: any = null;
    try { detected = await fileType.fromBuffer(file.buffer); } catch {}
    if (detected && !VOICE_MIMES.has(detected.mime)) {
      throw new BadRequestException('Fayl turi mos kelmadi');
    }

    const config = ALLOWED_MIME_TYPES[file.mimetype] ?? { ext: 'bin' };
    const now = new Date();
    const uploadId = uuidv4();
    const storageKey = this.buildStorageKey(now, uploadId, config.ext);
    const safeFileName = this.sanitizeFileName(file.originalname);

    await this.minio.putObject(storageKey, file.buffer, file.mimetype);

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: user.sub,
        storageKey,
        mimeType: file.mimetype,
        fileName: safeFileName,
        sizeBytes: BigInt(file.size),
      },
    });

    await this.rabbitmq.publish('media.uploaded', {
      attachment_id: attachment.id,
      uploader_id: attachment.uploaderId,
      storage_key: attachment.storageKey,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes.toString(),
      timestamp: Date.now(),
    });

    this.logger.log({ event: 'voice_uploaded', attachmentId: attachment.id, userId: user.sub });

    const url = await this.minio.presignedGetUrl(storageKey);
    return { ...attachment, sizeBytes: attachment.sizeBytes.toString(), url };
  }

  // ── QISM 4: Thumbnail generation ─────────────────────────────────────────

  private async processThumbnail(attachmentId: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!att) return;

    let thumbnailKey: string | null = null;

    if (att.mimeType.startsWith('image/')) {
      thumbnailKey = await this.generateImageThumbnail(att.storageKey, attachmentId);
    } else if (att.mimeType.startsWith('video/')) {
      thumbnailKey = await this.generateVideoThumbnail(att.storageKey, attachmentId);
    } else {
      // Audio / docs — stub
      this.logger.log({ event: 'thumbnail_stub', mimeType: att.mimeType, attachmentId });
      return;
    }

    if (thumbnailKey) {
      await this.prisma.attachment.update({
        where: { id: attachmentId },
        data: { thumbnailKey },
      });
      this.logger.log({ event: 'thumbnail_saved', attachmentId, thumbnailKey });
    }
  }

  private async generateImageThumbnail(storageKey: string, attachmentId: string): Promise<string | null> {
    try {
      const sharp = require('sharp');
      const buf = await this.minio.getObject(storageKey);
      const thumb = await sharp(buf)
        .resize(256, 256, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();

      const thumbKey = `thumbs/${attachmentId}.jpg`;
      await this.minio.putObject(thumbKey, thumb, 'image/jpeg');
      return thumbKey;
    } catch (e) {
      this.logger.warn({ event: 'image_thumb_fail', err: e?.message });
      return null;
    }
  }

  private async generateVideoThumbnail(storageKey: string, attachmentId: string): Promise<string | null> {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      ffmpeg.setFfmpegPath(ffmpegPath);

      const buf = await this.minio.getObject(storageKey);
      const tmpInput = `/tmp/${attachmentId}_in`;
      const tmpOutput = `/tmp/${attachmentId}_thumb.jpg`;
      const fs = require('fs');
      fs.writeFileSync(tmpInput, buf);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tmpInput)
          .seekInput(1)
          .frames(1)
          .output(tmpOutput)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const thumb = fs.readFileSync(tmpOutput);
      const thumbKey = `thumbs/${attachmentId}.jpg`;
      await this.minio.putObject(thumbKey, thumb, 'image/jpeg');

      try { fs.unlinkSync(tmpInput); fs.unlinkSync(tmpOutput); } catch {}
      return thumbKey;
    } catch (e) {
      this.logger.warn({ event: 'video_thumb_fail', err: e?.message });
      return null;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildStorageKey(date: Date, uuid: string, ext: string): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}/${uuid}.${ext}`;
  }

  private sanitizeFileName(name: string): string {
    return path.basename(name)
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .slice(0, 255);
  }

  private needsThumbnail(mimeType: string): boolean {
    return mimeType.startsWith('image/') || mimeType.startsWith('video/');
  }
}
