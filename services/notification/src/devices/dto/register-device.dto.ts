import { IsString, IsEnum, IsOptional } from 'class-validator';

export class RegisterDeviceDto {
  @IsEnum(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';

  @IsString()
  pushToken: string;

  @IsOptional()
  @IsString()
  voipToken?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsEnum(['uz', 'ru'])
  locale?: 'uz' | 'ru';
}
