import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateRoomDto {
  @IsEnum(['direct', 'support', 'group'])
  type: 'direct' | 'support' | 'group';

  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
