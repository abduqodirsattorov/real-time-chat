import { IsBoolean } from 'class-validator';

export class TypingDto {
  @IsBoolean()
  typing: boolean;
}
