import { IsString, Length } from 'class-validator';

export class UpdateMessageDto {
  @IsString()
  @Length(1, 4096)
  content: string;
}
