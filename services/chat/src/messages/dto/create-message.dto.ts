import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsEnum(['text', 'image', 'file', 'audio', 'video'])
  type: string;

  @IsString()
  @Length(1, 4096)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;

  @IsOptional()
  @IsUUID('4')
  replyToId?: string;
}
