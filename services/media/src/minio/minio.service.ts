import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as Minio from 'minio';

const BUCKET = 'nova-media';
const PRESIGN_TTL = 3600; // 1 hour

@Injectable()
export class MinioService implements OnModuleInit {
  private client: Minio.Client;       // internal — for data ops
  private publicClient: Minio.Client; // presigned URL generation with public host
  private readonly logger = new Logger(MinioService.name);

  async onModuleInit() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'minio';
    const port = parseInt(process.env.MINIO_PORT ?? '9000');
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
    const secretKey = process.env.MINIO_SECRET_KEY ?? 'minioadmin123';

    this.client = new Minio.Client({ endPoint: endpoint, port, useSSL, accessKey, secretKey });

    // Parse public endpoint (e.g. http://localhost:9000)
    const publicRaw = process.env.MINIO_PUBLIC_ENDPOINT ?? 'http://localhost:9000';
    const publicUrl = new URL(publicRaw);
    this.publicClient = new Minio.Client({
      endPoint: publicUrl.hostname,
      port: parseInt(publicUrl.port || (publicUrl.protocol === 'https:' ? '443' : '80')),
      useSSL: publicUrl.protocol === 'https:',
      accessKey,
      secretKey,
      region: 'us-east-1', // pre-set to avoid HTTP region lookup
    });

    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(BUCKET);
      if (!exists) {
        await this.client.makeBucket(BUCKET, 'us-east-1');
        this.logger.log(`Bucket ${BUCKET} created`);
      }
    } catch (e) {
      this.logger.warn({ event: 'minio_bucket_warn', err: e?.message });
    }
  }

  async presignedPutUrl(storageKey: string, mimeType: string): Promise<string> {
    return this.publicClient.presignedPutObject(BUCKET, storageKey, PRESIGN_TTL);
  }

  async presignedGetUrl(storageKey: string): Promise<string> {
    return this.publicClient.presignedGetObject(BUCKET, storageKey, PRESIGN_TTL);
  }

  async getObject(storageKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(BUCKET, storageKey);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async putObject(storageKey: string, data: Buffer, mimeType: string): Promise<void> {
    await this.client.putObject(BUCKET, storageKey, data, data.length, {
      'Content-Type': mimeType,
    });
  }

  async statObject(storageKey: string): Promise<Minio.BucketItemStat> {
    return this.client.statObject(BUCKET, storageKey);
  }

}
