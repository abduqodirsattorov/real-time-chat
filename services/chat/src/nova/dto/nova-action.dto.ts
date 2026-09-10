import { IsString, IsNotEmpty, IsIn, IsOptional, IsObject, Length } from 'class-validator';

export const ALLOWED_NOVA_ACTIONS = [
  'recredit',
  'recredit_p2p',
  'cancel',
  'refund',
  'resend_receipt',
  'flag_fraud',
  'check_status',
  'export_csv',
] as const;

export type AllowedNovaAction = (typeof ALLOWED_NOVA_ACTIONS)[number];

export class ExecuteNovaActionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_NOVA_ACTIONS as unknown as string[], {
    message: 'Noma\'lum tranzaksiya amali. Ruxsat etilganlar: recredit, cancel, refund, resend_receipt, flag_fraud, check_status',
  })
  action: AllowedNovaAction;

  @IsOptional()
  @IsString()
  @Length(3, 255, { message: 'Amal sababi (reason) kamida 3 ta belgidan iborat bo\'lishi kerak' })
  reason?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, any>;
}
