import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const PRESENCE_TTL = 1800;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    this.client = url
      ? new Redis(url, { maxRetriesPerRequest: 3 })
      : new Redis({ host: 'redis', port: 6379, maxRetriesPerRequest: 3 });
  }

  async onModuleDestroy() { await this.client.quit(); }

  async isOnline(userId: string): Promise<boolean> {
    const val = await this.client.get(`presence:user:${userId}`);
    return val !== null;
  }
}
