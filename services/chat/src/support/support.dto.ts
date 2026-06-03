import { IsOptional, IsString, IsArray } from 'class-validator';

export class SupportRequestDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @IsOptional()
  @IsString()
  productId?: string;
}
