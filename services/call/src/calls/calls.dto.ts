import { IsOptional, IsString, IsArray, IsEnum, IsBoolean, IsUUID } from 'class-validator';

export class InitiateCallDto {
  @IsOptional() @IsArray() @IsString({ each: true })
  requiredSkills?: string[];

  @IsOptional() @IsString()
  subject?: string;

  @IsOptional() @IsUUID()
  productId?: string;
}

export class OutboundCallDto {
  @IsUUID() calleeId: string;
  @IsOptional() @IsString() subject?: string;
}

export class TransferCallDto {
  @IsEnum(['cold', 'warm']) type: 'cold' | 'warm';
  @IsUUID() toOperatorId: string;
}

export class HoldDto {
  @IsBoolean() hold: boolean;
}

export class MuteDto {
  @IsBoolean() muted: boolean;
}

export class ConsentAckDto {
  @IsUUID() recordingId: string;
}
