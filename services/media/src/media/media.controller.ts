import {
  Controller, Post, Get, Param, Body, UseGuards,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { PresignDto } from './dto/presign.dto';
import { ConfirmDto } from './dto/confirm.dto';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  presign(@CurrentUser() user: JwtUser, @Body() dto: PresignDto) {
    return this.media.presign(user, dto);
  }

  @Post('confirm')
  confirm(@CurrentUser() user: JwtUser, @Body() dto: ConfirmDto) {
    return this.media.confirm(user, dto);
  }

  @Get(':id')
  getAttachment(@Param('id') id: string) {
    return this.media.getAttachment(id);
  }

  @Get(':id/thumbnail')
  getThumbnail(@Param('id') id: string) {
    return this.media.getThumbnail(id);
  }

  @Post('voice')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      storage: undefined, // memory storage
    }),
  )
  uploadVoice(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.uploadVoice(user, file);
  }
}
