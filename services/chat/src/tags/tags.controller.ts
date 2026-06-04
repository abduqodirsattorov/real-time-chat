import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  /** GET /tags — list all tags for current product */
  @Get()
  list(@Headers('x-product-id') productId: string) {
    return this.tags.list(productId ?? '');
  }

  /** POST /tags — admin creates tag */
  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Body() dto: CreateTagDto,
  ) {
    return this.tags.create(user, productId, dto);
  }

  /** PATCH /tags/:id — admin updates tag */
  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(user, id, productId, dto);
  }

  /** DELETE /tags/:id — admin deletes tag */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: JwtUser,
    @Headers('x-product-id') productId: string,
    @Param('id') id: string,
  ) {
    return this.tags.remove(user, id, productId);
  }
}
