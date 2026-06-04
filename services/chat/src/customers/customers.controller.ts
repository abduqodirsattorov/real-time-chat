import { Controller, Get, Post, Patch, Param, Body, Query, Headers, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import { UpsertCustomerDto, UpdateCustomerDto } from './dto/customers.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('by-room/:roomId')
  getByRoom(@CurrentUser() user: JwtUser, @Param('roomId') roomId: string) {
    return this.customers.getByRoom(user, roomId);
  }

  @Get(':id/history')
  getHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Headers('x-product-id') productId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.customers.getHistory(user, id, productId, limit ? +limit : 10, cursor);
  }

  @Get('by-uid/:uid')
  getByUid(
    @CurrentUser() user: JwtUser,
    @Param('uid') uid: string,
    @Query('productId') productId: string,
  ) {
    return this.customers.getByUid(user, productId, uid);
  }

  @Post('upsert')
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertCustomerDto) {
    return this.customers.upsert(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(user, id, dto);
  }
}
