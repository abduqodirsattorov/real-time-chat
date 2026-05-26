import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListRoomsDto {
  @IsOptional()
  @IsEnum(['active', 'pending', 'closed', 'archived'])
  status?: string;

  @IsOptional()
  @IsEnum(['direct', 'support', 'group'])
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
}
