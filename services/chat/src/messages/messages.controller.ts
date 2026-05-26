import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { TypingDto } from './dto/typing.dto';

@Controller('')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('rooms/:roomId/messages')
  list(
    @CurrentUser() user: JwtUser,
    @Param('roomId') roomId: string,
    @Query() dto: ListMessagesDto,
  ) {
    return this.messages.list(user, roomId, dto);
  }

  @Post('rooms/:roomId/messages')
  create(
    @CurrentUser() user: JwtUser,
    @Param('roomId') roomId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messages.create(user, roomId, dto);
  }

  @Patch('messages/:id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.update(user, id, dto);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.delete(user, id);
  }

  @Post('messages/:id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.markRead(user, id);
  }

  @Post('rooms/:roomId/typing')
  @HttpCode(HttpStatus.OK)
  typing(
    @CurrentUser() user: JwtUser,
    @Param('roomId') roomId: string,
    @Body() dto: TypingDto,
  ) {
    return this.messages.typing(user, roomId, dto.typing);
  }
}
