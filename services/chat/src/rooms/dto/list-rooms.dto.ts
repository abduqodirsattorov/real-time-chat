import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListRoomsDto {
  @IsOptional()
  @IsEnum(['open', 'pending', 'closed', 'bot_handling'])
  status?: string;

  @IsOptional()
  @IsEnum(['direct', 'support', 'transfer_consult'])
  type?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  /** Filter rooms by tag UUID */
  @IsOptional()
  @IsString()
  tagId?: string;
}
