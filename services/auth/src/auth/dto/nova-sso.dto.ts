import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, Length } from 'class-validator';

export class NovaSsoDto {
  @IsString()
  @IsNotEmpty()
  novaUserId: string;

  @IsEnum(['operator', 'supervisor', 'admin'])
  novaRole: 'operator' | 'supervisor' | 'admin';

  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  fullName: string;

  @IsOptional()
  @IsEnum(['uz', 'ru'])
  locale?: 'uz' | 'ru';

  @IsNumber()
  timestamp: number;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
