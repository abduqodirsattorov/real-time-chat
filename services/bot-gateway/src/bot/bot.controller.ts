import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { BotService } from './bot.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateBotConfigDto, UpdateBotConfigDto, TestBotDto } from './bot.dto';

@UseGuards(JwtAuthGuard)
@Controller('bot')
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Post('configs')
  createConfig(@CurrentUser() user: JwtUser, @Body() dto: CreateBotConfigDto) {
    return this.bot.createBotConfig(user, dto);
  }

  @Get('configs')
  getConfigs(@CurrentUser() user: JwtUser) {
    return this.bot.getBotConfigs(user);
  }

  @Get('configs/:id')
  getConfig(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.bot.getBotConfig(user, id);
  }

  @Patch('configs/:id')
  updateConfig(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateBotConfigDto) {
    return this.bot.updateBotConfig(user, id, dto);
  }

  @Delete('configs/:id')
  deleteConfig(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.bot.deleteBotConfig(user, id);
  }

  @Post('test')
  testBot(@CurrentUser() user: JwtUser, @Body() dto: TestBotDto) {
    return this.bot.testBot(user, dto);
  }

  @Post('handoff/:roomId')
  manualHandoff(@CurrentUser() user: JwtUser, @Param('roomId') roomId: string) {
    return this.bot.manualHandoff(user, roomId);
  }
}
