import { IsEnum } from 'class-validator';

export class UpdateLocaleDto {
  @IsEnum(['uz', 'ru'])
  locale: 'uz' | 'ru';
}
