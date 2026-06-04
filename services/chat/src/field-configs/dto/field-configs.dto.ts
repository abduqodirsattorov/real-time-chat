import { IsString, IsBoolean, IsInt, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

const CONTEXTS = ['tx_table', 'tx_detail', 'profile'] as const;
const DISPLAY_TYPES = ['text', 'date', 'badge', 'amount'] as const;

export class FieldConfigItemDto {
  @IsString()
  fieldKey: string;

  @IsString()
  label: string;

  @IsBoolean()
  visible: boolean;

  @IsInt()
  sortOrder: number;

  @IsIn(DISPLAY_TYPES)
  displayType: string;
}

export class BulkUpdateFieldConfigsDto {
  @IsIn(CONTEXTS)
  context: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldConfigItemDto)
  items: FieldConfigItemDto[];
}
