import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchDto {
  @IsString()
  q: string;

  @IsOptional()
  @IsUUID('4')
  roomId?: string;

  @IsOptional()
  @IsUUID('4')
  senderId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  dateFrom?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  dateTo?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
