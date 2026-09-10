import { IsString, MinLength, Matches } from 'class-validator';

export class UpdatePasswordDto {
  @IsString()
  @MinLength(10, { message: 'Parol kamida 10 ta belgidan iborat bo\'lishi shart' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/, {
    message: 'Parol tarkibida kamida bitta katta harf, bitta kichik harf va bitta raqam bo\'lishi shart',
  })
  password: string;
}
