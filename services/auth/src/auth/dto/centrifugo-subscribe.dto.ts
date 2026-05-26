import { IsString, IsNotEmpty } from 'class-validator';

export class CentrifugoSubscribeDto {
  @IsString()
  @IsNotEmpty()
  channel: string;
}
