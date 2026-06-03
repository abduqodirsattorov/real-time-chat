import {
  Controller, Get, Post, Param, Body, Query, Headers, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { UpsertTransactionDto, ListTransactionsQuery } from './dto/transactions.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Query() q: ListTransactionsQuery,
  ) {
    return this.svc.list(user, productId, q);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Param('id') id: string,
  ) {
    return this.svc.getOne(user, productId, id);
  }

  @Post('upsert')
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertTransactionDto) {
    return this.svc.upsert(user, dto);
  }
}
