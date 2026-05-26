import { IsEnum } from 'class-validator';

export enum OperatorStatusEnum {
  offline     = 'offline',
  available   = 'available',
  busy        = 'busy',
  away        = 'away',
  on_call     = 'on_call',
  in_transfer = 'in_transfer',
}

export class UpdateStatusDto {
  @IsEnum(OperatorStatusEnum, {
    message: 'status qiymati notog\'ri. Ruxsat etilgan: offline, available, busy, away, on_call, in_transfer',
  })
  status: OperatorStatusEnum;
}
