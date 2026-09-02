import {
  Controller, Post, Get, Body, Param, Query, Headers,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import {
  InitiateCallDto, OutboundCallDto, TransferCallDto,
  HoldDto, MuteDto, ConsentAckDto,
} from './calls.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  // QISM 3
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  initiate(@CurrentUser() user: JwtUser, @Body() dto: InitiateCallDto) {
    return this.calls.initiateCall(user, dto);
  }

  // QISM 5
  @Post('outbound')
  @HttpCode(HttpStatus.OK)
  outbound(@CurrentUser() user: JwtUser, @Body() dto: OutboundCallDto) {
    return this.calls.outboundCall(user, dto);
  }

  // QISM 10 — Global queue (operator bo'lmagan inbound kutuvchi calllar)
  @Get('queue')
  getQueue(@CurrentUser() user: JwtUser) {
    return this.calls.getCallQueue(user);
  }

  @Get()
  getCalls(
    @CurrentUser() user: JwtUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Headers('x-product-id') productId?: string,
  ) {
    return this.calls.getCalls(user, limit, offset, productId);
  }

  @Get(':id')
  getCall(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.getCall(user, id);
  }

  @Post(':id/livekit-token')
  @HttpCode(HttpStatus.OK)
  getLivekitToken(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.getLivekitToken(user, id);
  }

  @Post('livekit/token')
  @HttpCode(HttpStatus.OK)
  getLivekitTokenLegacy(@CurrentUser() user: JwtUser, @Body() body: { callId: string }) {
    return this.calls.getLivekitToken(user, body.callId);
  }

  // QISM 4
  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  answer(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.answerCall(user, id);
  }

  @Post(':id/hangup')
  @HttpCode(HttpStatus.OK)
  hangup(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.hangupCall(user, id);
  }

  // QISM 6
  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  hold(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: HoldDto) {
    return this.calls.holdCall(user, id, dto);
  }

  @Post(':id/mute')
  @HttpCode(HttpStatus.OK)
  mute(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: MuteDto) {
    return this.calls.muteCall(user, id, dto);
  }

  // QISM 7+8
  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  transfer(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: TransferCallDto) {
    return this.calls.transferCall(user, id, dto);
  }

  @Post(':id/transfer/complete')
  @HttpCode(HttpStatus.OK)
  completeTransfer(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.completeWarmTransfer(user, id);
  }

  @Post(':id/transfer/cancel')
  @HttpCode(HttpStatus.OK)
  cancelTransfer(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.cancelWarmTransfer(user, id);
  }

  // QISM 9
  @Post(':id/recording/start')
  @HttpCode(HttpStatus.OK)
  startRecording(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.startRecording(user, id);
  }

  @Post(':id/recording/consent-ack')
  @HttpCode(HttpStatus.OK)
  consentAck(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ConsentAckDto) {
    return this.calls.recordingConsentAck(user, id, dto.recordingId);
  }

  @Post(':id/recording/stop')
  @HttpCode(HttpStatus.OK)
  stopRecording(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.calls.stopRecording(user, id);
  }
}
