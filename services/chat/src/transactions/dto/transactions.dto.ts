import { IsOptional, IsString, IsObject, IsNumberString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertTransactionDto {
  @IsString()
  productId: string;

  @IsString()
  externalId: string;

  @IsOptional()
  @IsString()
  userUid?: string;

  @IsObject()
  data: Record<string, unknown>;
}

export class ListTransactionsQuery {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 30;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  userUid?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  debitState?: string;

  @IsOptional()
  @IsString()
  creditState?: string;
}
