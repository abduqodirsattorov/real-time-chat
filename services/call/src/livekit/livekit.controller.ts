import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { LiveKitService } from './livekit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { IsString } from 'class-validator';
import { CallsService } from '../calls/calls.service';
import { Logger } from '@nestjs/common';

class TokenDto {
  @IsString() callId: string;
}

@Controller('livekit')
export class LiveKitController {
  private readonly logger = new Logger(LiveKitController.name);

  constructor(
    private readonly livekit: LiveKitService,
    private readonly calls: CallsService,
  ) {}

  @Post('token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getToken(@CurrentUser() user: JwtUser, @Body() dto: TokenDto) {
    const call = await this.calls.getCall(user, dto.callId);
    const token = await this.livekit.generateToken(user.sub, call.livekitRoom!);
    return { token, url: this.livekit.wsUrl, room: call.livekitRoom };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() body: any) {
    const event = body?.event;
    this.logger.log({ event: 'livekit_webhook', lkEvent: event, room: body?.room?.name });

    if (event === 'egress_ended') {
      const egressId = body?.egressInfo?.egressId;
      if (egressId) {
        this.logger.log({ event: 'egress_ended', egressId });
      }
    }

    return { received: true };
  }
}
