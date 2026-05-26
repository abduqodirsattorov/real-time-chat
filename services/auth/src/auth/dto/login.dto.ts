import { IsString, IsPhoneNumber } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsPhoneNumber()
  phone: string;
}
