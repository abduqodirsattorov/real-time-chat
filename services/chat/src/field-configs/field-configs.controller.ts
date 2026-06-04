import { Controller, Get, Patch, Query, Body, Headers, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { FieldConfigsService } from './field-configs.service';
import { BulkUpdateFieldConfigsDto } from './dto/field-configs.dto';

@Controller('field-configs')
@UseGuards(JwtAuthGuard)
export class FieldConfigsController {
  constructor(private readonly service: FieldConfigsService) {}

  /** GET /field-configs?context=tx_table|tx_detail|profile */
  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Query('context') context: string,
  ) {
    return this.service.list(user, productId ?? '', context ?? 'tx_table');
  }

  /** PATCH /field-configs — admin bulk update */
  @Patch()
  bulkUpdate(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Body() dto: BulkUpdateFieldConfigsDto,
  ) {
    return this.service.bulkUpdate(user, productId ?? '', dto);
  }
}
