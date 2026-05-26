import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { SupportRequestDto } from './support.dto';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  request(@CurrentUser() user: JwtUser, @Body() dto: SupportRequestDto) {
    return this.support.requestSupport(user, dto);
  }
}
