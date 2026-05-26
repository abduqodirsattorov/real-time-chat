import { IsOptional, IsString } from 'class-validator';

export class CentrifugoTokenDto {
  @IsOptional()
  @IsString()
  info?: string;
}
