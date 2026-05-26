import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class TransferTargetsDto {
  @IsOptional()
  @IsEnum(['uz', 'ru'])
  language?: string;

  @IsOptional()
  @IsUUID('4')
  exclude_user_id?: string;
}
