import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class ConfirmDto {
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  durationMs?: number;
}
