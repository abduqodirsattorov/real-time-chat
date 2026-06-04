import {
  IsString, IsOptional, IsArray, IsUUID,
  MaxLength, Matches,
} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{3,6}$/, { message: 'color must be a valid hex color (e.g. #EF4444)' })
  color?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{3,6}$/, { message: 'color must be a valid hex color' })
  color?: string;
}

export class SetRoomTagsDto {
  @IsArray()
  @IsString({ each: true })
  tagIds: string[];
}
