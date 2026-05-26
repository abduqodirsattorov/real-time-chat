import { IsString, IsPhoneNumber } from 'class-validator';

export class OtpSendDto {
  @IsString()
  @IsPhoneNumber()
  phone: string;
}
