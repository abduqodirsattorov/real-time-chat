import { Injectable, Logger } from '@nestjs/common';
import {
  RoomServiceClient,
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  S3Upload,
} from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);

  private readonly host = process.env.LIVEKIT_HOST ?? 'http://localhost:7880';
  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  private readonly secret = process.env.LIVEKIT_SECRET ?? 'devsecret_change_me_32_chars_minimum_xx';

  private readonly roomClient: RoomServiceClient;
  private readonly egressClient: EgressClient;

  constructor() {
    this.roomClient = new RoomServiceClient(this.host, this.apiKey, this.secret);
    this.egressClient = new EgressClient(this.host, this.apiKey, this.secret);
  }

  async createRoom(name: string, emptyTimeoutSecs = 300): Promise<void> {
    try {
      await this.roomClient.createRoom({ name, emptyTimeout: emptyTimeoutSecs });
      this.logger.log({ event: 'livekit_room_created', name });
    } catch (err) {
      this.logger.warn({ event: 'livekit_create_room_error', name, err: String(err) });
      // Non-fatal: room is auto-created when first participant joins
    }
  }

  async generateToken(
    identity: string,
    roomName: string,
    grants: { canPublish?: boolean; canSubscribe?: boolean; roomAdmin?: boolean } = {},
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.secret, {
      identity,
      ttl: '4h',
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: grants.canPublish ?? true,
      canSubscribe: grants.canSubscribe ?? true,
      roomAdmin: grants.roomAdmin ?? false,
    });
    return token.toJwt();
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    try {
      await this.roomClient.removeParticipant(roomName, identity);
      this.logger.log({ event: 'livekit_participant_removed', roomName, identity });
    } catch (err) {
      this.logger.warn({ event: 'livekit_remove_participant_error', roomName, identity, err });
    }
  }

  async destroyRoom(roomName: string): Promise<void> {
    try {
      await this.roomClient.deleteRoom(roomName);
      this.logger.log({ event: 'livekit_room_destroyed', roomName });
    } catch (err) {
      this.logger.warn({ event: 'livekit_destroy_room_error', roomName, err });
    }
  }

  async mutePublishedTrack(roomName: string, identity: string, muted: boolean): Promise<void> {
    try {
      const participants = await this.roomClient.listParticipants(roomName);
      const participant = participants.find((p) => p.identity === identity);
      if (!participant) return;
      for (const track of participant.tracks) {
        if (track.type === 0) {
          await this.roomClient.mutePublishedTrack(roomName, identity, track.sid, muted);
        }
      }
    } catch (err) {
      this.logger.warn({ event: 'livekit_mute_error', roomName, identity, err });
    }
  }

  async startRecordingEgress(callId: string, recordingId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const filepath = `recordings/${year}/${month}/${callId}.mp3`;

    const s3Upload = new S3Upload({
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secret: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      bucket: process.env.RECORDING_BUCKET ?? 'nova-recordings',
      endpoint: process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
      forcePathStyle: true,
    });

    const fileOutput = new EncodedFileOutput({ filepath, output: { case: 's3', value: s3Upload } });

    const egress = await this.egressClient.startRoomCompositeEgress(
      `call-${callId}`,
      fileOutput,
      '',
      undefined,
      true,
    );

    this.logger.log({ event: 'livekit_egress_started', callId, egressId: egress.egressId });
    return egress.egressId;
  }

  async stopEgress(egressId: string): Promise<void> {
    try {
      await this.egressClient.stopEgress(egressId);
      this.logger.log({ event: 'livekit_egress_stopped', egressId });
    } catch (err) {
      this.logger.warn({ event: 'livekit_stop_egress_error', egressId, err });
    }
  }
}
