import { IsString, IsPhoneNumber, IsOptional, IsEnum, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsPhoneNumber()
  phone: string;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  fullName?: string;

  @IsOptional()
  @IsEnum(['uz', 'ru'])
  locale?: 'uz' | 'ru';
}
