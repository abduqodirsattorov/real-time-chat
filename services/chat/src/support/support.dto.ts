import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

export class SupportRequestDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];
}
