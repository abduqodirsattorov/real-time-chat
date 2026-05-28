import { Injectable, Logger } from '@nestjs/common';
import { EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';

@Injectable()
export class LiveKitEgressService {
  private readonly logger = new Logger(LiveKitEgressService.name);

  private readonly host = process.env.LIVEKIT_HOST ?? 'http://localhost:7880';
  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  private readonly secret = process.env.LIVEKIT_SECRET ?? 'devsecret_change_me_32_chars_minimum_xx';

  private readonly egressClient: EgressClient;

  constructor() {
    this.egressClient = new EgressClient(this.host, this.apiKey, this.secret);
  }

  async startRoomEgress(callId: string, livekitRoom: string): Promise<string | null> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const filepath = `recordings/${year}/${month}/${callId}.mp3`;

    try {
      const s3Upload = new S3Upload({
        accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secret: process.env.MINIO_SECRET_KEY ?? 'minioadmin123',
        bucket: process.env.MINIO_BUCKET ?? 'nova-recordings',
        endpoint: process.env.MINIO_ENDPOINT_INTERNAL ?? 'http://minio:9000',
        forcePathStyle: true,
      });

      const fileOutput = new EncodedFileOutput({
        filepath,
        output: { case: 's3', value: s3Upload },
      });

      const egress = await this.egressClient.startRoomCompositeEgress(
        livekitRoom,
        fileOutput,
        '',
        undefined,
        true,
      );

      this.logger.log({ event: 'egress_started', callId, egressId: egress.egressId, room: livekitRoom });
      return egress.egressId;
    } catch (err) {
      this.logger.warn({ event: 'egress_start_warn', callId, err: String(err) });
      return null;
    }
  }

  async stopEgress(egressId: string): Promise<void> {
    try {
      await this.egressClient.stopEgress(egressId);
      this.logger.log({ event: 'egress_stopped', egressId });
    } catch (err) {
      this.logger.warn({ event: 'egress_stop_warn', egressId, err: String(err) });
    }
  }
}
