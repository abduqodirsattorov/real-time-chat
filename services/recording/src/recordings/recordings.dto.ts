import { IsUUID, IsString } from 'class-validator';

export class StartRecordingDto {
  @IsUUID() recordingId: string;
  @IsUUID() callId: string;
  @IsString() livekitRoom: string;
}

export class StopRecordingDto {
  @IsUUID() recordingId: string;
}
