import { IsString, IsPhoneNumber, Length } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
