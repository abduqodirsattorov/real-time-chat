import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsEnum(['active', 'pending', 'closed', 'archived'])
  status?: string;
}
