import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CentrifugoService {
  private readonly logger = new Logger(CentrifugoService.name);
  private readonly apiUrl = process.env.CENTRIFUGO_API_URL ?? 'http://centrifugo:8000/api';
  private readonly apiKey = process.env.CENTRIFUGO_API_KEY ?? '';

  async publish(channel: string, data: object): Promise<void> {
    try {
      const res = await fetch(`${this.apiUrl}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
        body: JSON.stringify({ channel, data }),
      });
      if (!res.ok) this.logger.warn({ event: 'centrifugo_publish_error', channel, status: res.status });
    } catch (err) {
      this.logger.error({ event: 'centrifugo_publish_fail', channel, err });
    }
  }

  async publishToUser(userId: string, event: string, data: object): Promise<void> {
    await this.publish(`chat:user#${userId}`, { event, ...data });
  }

  async publishToRoom(roomId: string, event: string, data: object): Promise<void> {
    await this.publish(`room:${roomId}`, { event, ...data });
  }

  async playAudioToCall(callId: string, audioUrl: string, audience: 'all' | 'caller' | 'callee' = 'all'): Promise<void> {
    await this.publish(`call:${callId}`, { event: 'play_audio', url: audioUrl, audience, ts: new Date().toISOString() });
  }
}
