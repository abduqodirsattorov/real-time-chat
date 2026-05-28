import { IsString, IsBoolean, IsOptional, IsArray, IsObject, IsIn } from 'class-validator';

export class CreateBotConfigDto {
  @IsString()
  name: string;

  @IsIn(['faq', 'ai', 'hybrid'])
  type: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  fallbackToHuman?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  handoffKeywords?: string[];
}

export class UpdateBotConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  fallbackToHuman?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  handoffKeywords?: string[];
}

export class TestBotDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  botConfigId?: string;
}
