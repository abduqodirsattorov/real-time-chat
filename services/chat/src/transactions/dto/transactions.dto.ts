import { IsOptional, IsString, IsObject } from 'class-validator';
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
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  // search: ext_id ILIKE '%q%' OR data->>'phone' ILIKE '%q%'
  @IsOptional()
  @IsString()
  search?: string;

  // direct userUid filter (from chat profile)
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

  @IsOptional()
  @IsString()
  strana?: string;
}
