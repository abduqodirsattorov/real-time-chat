import {
  Controller, Get, Post, Patch, Param, Body,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsDto } from './dto/list-rooms.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() dto: ListRoomsDto) {
    return this.rooms.list(user, dto);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateRoomDto) {
    return this.rooms.create(user, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rooms.getOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(user, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rooms.close(user, id);
  }
}
