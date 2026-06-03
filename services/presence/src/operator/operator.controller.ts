import { Controller, Post, Patch, Get, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { OperatorService } from './operator.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { TransferTargetsDto } from './dto/transfer-targets.dto';

@Controller('operator')
@UseGuards(JwtAuthGuard)
export class OperatorController {
  constructor(private readonly operator: OperatorService) {}

  @Post('status')
  updateStatus(@CurrentUser() user: JwtUser, @Body() dto: UpdateStatusDto) {
    return this.operator.updateStatus(user, dto);
  }

  @Patch('product')
  selectProduct(@CurrentUser() user: JwtUser, @Body() body: { productId: string }) {
    return this.operator.selectProduct(user, body.productId);
  }

  @Get('online')
  getOnline(@CurrentUser() user: JwtUser) {
    return this.operator.getOnlineOperators(user);
  }

  @Get('transfer-targets')
  getTransferTargets(@CurrentUser() user: JwtUser, @Query() dto: TransferTargetsDto) {
    return this.operator.getTransferTargets(user, dto);
  }
}
