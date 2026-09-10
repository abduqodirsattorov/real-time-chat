import {
  Controller, Post, Body, Headers, Logger, HttpCode, HttpStatus,
  RawBodyRequest, Req, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { RecordingsService } from '../recordings/recordings.service';
import { WebhookReceiver } from 'livekit-server-sdk';
import { Request } from 'express';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly receiver: WebhookReceiver;

  constructor(private readonly recordings: RecordingsService) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_SECRET;
    if (process.env.NODE_ENV === 'production' && (!apiKey || !apiSecret)) {
      throw new Error('LIVEKIT_API_KEY va LIVEKIT_SECRET production muhitida sozlanishi shart (fail-closed)');
    }
    this.receiver = new WebhookReceiver(
      apiKey ?? 'devkey',
      apiSecret ?? 'devsecret_change_me_32_chars_minimum_xx',
    );
  }

  @Post('livekit/egress')
  @HttpCode(HttpStatus.OK)
  async livekitEgress(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader: string,
    @Body() body: any,
  ) {
    if (!authHeader) {
      this.logger.warn({ event: 'livekit_webhook_missing_auth' });
      throw new UnauthorizedException('Missing LiveKit webhook authorization header');
    }

    const rawBody = req.rawBody?.toString() ?? JSON.stringify(body || {});
    let eventData: any;
    try {
      eventData = await this.receiver.receive(rawBody, authHeader);
    } catch (err) {
      this.logger.error({ event: 'livekit_webhook_invalid_signature', err: String(err) });
      throw new UnauthorizedException('Invalid LiveKit webhook signature');
    }

    const event = body?.event;
    const egressId = body?.egressInfo?.egressId ?? body?.egress_id;

    this.logger.log({ event: 'livekit_webhook', lkEvent: event, egressId });

    switch (event) {
      case 'egress_started':
        if (egressId) await this.recordings.handleEgressStarted(egressId);
        break;
      case 'egress_ended':
        if (egressId) await this.recordings.handleEgressEnded(egressId, body?.egressInfo);
        break;
      case 'egress_failed': {
        const reason = body?.egressInfo?.error ?? body?.error ?? 'unknown';
        if (egressId) await this.recordings.handleEgressFailed(egressId, reason);
        break;
      }
      default:
        this.logger.log({ event: 'livekit_webhook_ignored', lkEvent: event });
    }

    return { received: true };
  }
}
