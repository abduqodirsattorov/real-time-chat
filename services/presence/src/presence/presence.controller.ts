import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { PresenceService } from './presence.service';
import { BulkPresenceDto } from './dto/bulk-presence.dto';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get('users/:id')
  getUserPresence(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.presence.getUserPresence(id, user.role);
  }

  @Post('users/bulk')
  getBulkPresence(@Body() dto: BulkPresenceDto) {
    return this.presence.getBulkPresence(dto.ids);
  }
}
