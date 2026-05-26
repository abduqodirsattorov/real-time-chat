import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'redis',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (e) => this.logger.error('Redis error', e));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  async onModuleDestroy() { await this.client.quit(); }

  async get(key: string) { return this.client.get(key); }
  async set(key: string, value: string, ttl?: number) {
    if (ttl) await this.client.set(key, value, 'EX', ttl);
    else await this.client.set(key, value);
  }
  async setnx(key: string, value: string, ttl: number): Promise<boolean> {
    const r = await this.client.set(key, value, 'EX', ttl, 'NX');
    return r === 'OK';
  }
  async del(...keys: string[]) { await this.client.del(...keys); }
  async incr(key: string) { return this.client.incr(key); }
  async expire(key: string, ttl: number) { await this.client.expire(key, ttl); }
  async zadd(key: string, score: number, member: string) { await this.client.zadd(key, score, member); }
  async zrangebyscore(key: string, min: number, max: number) { return this.client.zrangebyscore(key, min, max); }
  async zrem(key: string, member: string) { await this.client.zrem(key, member); }
  async ping() { try { return (await this.client.ping()) === 'PONG'; } catch { return false; } }
}
