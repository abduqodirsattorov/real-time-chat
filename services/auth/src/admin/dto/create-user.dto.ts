import { IsEmail, IsIn, IsOptional, IsString, MinLength, IsArray, Matches } from 'class-validator';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class CreateUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10, { message: 'Parol kamida 10 ta belgidan iborat bo\'lishi shart' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/, {
    message: 'Parol tarkibida kamida bitta katta harf, bitta kichik harf va bitta raqam bo\'lishi shart',
  })
  password: string;

  @IsOptional()
  @IsIn(['operator', 'supervisor', 'admin'])
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(UUID_REGEX, { each: true })
  productIds?: string[];
}
