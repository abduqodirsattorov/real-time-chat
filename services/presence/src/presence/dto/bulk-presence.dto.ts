import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

export class BulkPresenceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}
