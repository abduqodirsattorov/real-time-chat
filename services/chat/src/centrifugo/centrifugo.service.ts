import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class CentrifugoService implements OnModuleInit {
  private http: AxiosInstance;
  private readonly logger = new Logger(CentrifugoService.name);

  onModuleInit() {
    this.http = axios.create({
      baseURL: process.env.CENTRIFUGO_API_URL ?? 'http://centrifugo:8000/api',
      headers: {
        'X-API-Key': process.env.CENTRIFUGO_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      timeout: 3000,
    });
  }

  async publish(channel: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.http.post('', { method: 'publish', params: { channel, data } });
    } catch (e) {
      this.logger.warn({ event: 'centrifugo_publish_fail', channel, err: e?.message });
    }
  }

  async publishToRoom(roomId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(`chat:room#${roomId}`, { event, ...payload });
  }

  async publishPresence(roomId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(`presence:${roomId}`, { event, ...payload });
  }
}
