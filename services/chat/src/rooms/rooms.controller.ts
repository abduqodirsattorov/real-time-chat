import {
  Controller, Get, Post, Patch, Param, Body,
  Query, UseGuards, HttpCode, HttpStatus, Headers, ParseUUIDPipe,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { TagsService } from '../tags/tags.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsDto } from './dto/list-rooms.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { SetRoomTagsDto } from '../tags/dto/tags.dto';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly tags: TagsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query() dto: ListRoomsDto,
    @Headers('x-product-id') productId?: string,
  ) {
    return this.rooms.list(user, dto, productId);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateRoomDto,
    @Headers('x-product-id') productId?: string,
  ) {
    return this.rooms.create(user, dto, productId);
  }

  @Get('search-user')
  searchUser(
    @CurrentUser() user: JwtUser,
    @Query('phone') phone: string,
    @Headers('x-product-id') productId?: string,
  ) {
    return this.rooms.searchUser(user, phone, productId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.getOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(user, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.close(user, id);
  }

  @Patch(':id/tags')
  @HttpCode(HttpStatus.OK)
  setTags(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoomTagsDto,
    @Headers('x-product-id') productId?: string,
  ) {
    return this.tags.setRoomTags(user, id, dto.tagIds, productId);
  }
}
