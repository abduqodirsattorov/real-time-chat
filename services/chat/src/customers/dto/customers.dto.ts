import { IsOptional, IsString, IsArray, IsObject } from 'class-validator';

export class UpsertCustomerDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  externalUid?: string;

  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;
}
