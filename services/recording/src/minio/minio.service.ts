import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';

const SIGNED_URL_TTL = 3600; // 1 hour

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private readonly bucket = process.env.MINIO_BUCKET ?? 'nova-recordings';

  async onModuleInit() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'minio';
    const port = parseInt(process.env.MINIO_PORT ?? '9000', 10);
    const useSSL = process.env.MINIO_USE_SSL === 'true';

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin123',
    });

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log({ event: 'minio_bucket_created', bucket: this.bucket });
      }
      this.logger.log({ event: 'minio_ready', bucket: this.bucket });
    } catch (err) {
      this.logger.warn({ event: 'minio_init_warn', err: String(err) });
    }
  }

  storageKey(callId: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `recordings/${year}/${month}/${callId}.mp3`;
  }

  async signedGetUrl(key: string): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.bucket, key, SIGNED_URL_TTL);
    } catch (err) {
      this.logger.warn({ event: 'minio_sign_error', key, err: String(err) });
      return '';
    }
  }

  getBucket(): string { return this.bucket; }
}
