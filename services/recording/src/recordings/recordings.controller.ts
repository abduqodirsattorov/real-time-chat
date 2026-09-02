import {
  Controller, Post, Get, Body, Param,
  UseGuards, HttpCode, HttpStatus, Request,
} from '@nestjs/common';
import { RecordingsService } from './recordings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InternalOrJwtAuthGuard } from '../common/guards/internal-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { StartRecordingDto, StopRecordingDto } from './recordings.dto';

@Controller('recordings')
export class RecordingsController {
  constructor(private readonly svc: RecordingsService) {}

  // Internal endpoint — call-service calls this after consent-ack
  @Post('start')
  @UseGuards(InternalOrJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  start(@Body() dto: StartRecordingDto) {
    return this.svc.start(dto);
  }

  @Post('stop')
  @UseGuards(InternalOrJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  stop(@Body() dto: StopRecordingDto) {
    return this.svc.stop(dto);
  }

  @Get('by-call/:callId')
  @UseGuards(JwtAuthGuard)
  byCall(@CurrentUser() user: JwtUser, @Param('callId') callId: string) {
    return this.svc.getByCall(user, callId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOne(@CurrentUser() user: JwtUser, @Param('id') id: string, @Request() req: any) {
    return this.svc.getRecording(user, id, req);
  }
}
