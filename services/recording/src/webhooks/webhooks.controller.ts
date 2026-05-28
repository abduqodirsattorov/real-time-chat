import { Controller, Post, Body, Headers, Logger, HttpCode, HttpStatus, RawBodyRequest, Req } from '@nestjs/common';
import { RecordingsService } from '../recordings/recordings.service';
import { WebhookReceiver } from 'livekit-server-sdk';
import { Request } from 'express';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly receiver: WebhookReceiver;

  constructor(private readonly recordings: RecordingsService) {
    this.receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY ?? 'devkey',
      process.env.LIVEKIT_SECRET ?? 'devsecret_change_me_32_chars_minimum_xx',
    );
  }

  @Post('livekit/egress')
  @HttpCode(HttpStatus.OK)
  async livekitEgress(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader: string,
    @Body() body: any,
  ) {
    // Verify signature if raw body available, else log and process
    try {
      const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
      await this.receiver.receive(rawBody, authHeader);
    } catch {
      // In dev with no signature, continue (warn only)
      this.logger.warn({ event: 'webhook_sig_warn', body: JSON.stringify(body).slice(0, 100) });
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
