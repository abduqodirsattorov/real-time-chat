import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const PRESENCE_TTL = 1800; // 30 min
const ZSET_KEY = 'operator:available';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    this.client = url
      ? new Redis(url, { maxRetriesPerRequest: 3 })
      : new Redis({
          host: process.env.REDIS_HOST ?? 'redis',
          port: parseInt(process.env.REDIS_PORT ?? '6379'),
          maxRetriesPerRequest: 3,
        });
  }

  async onModuleDestroy() { await this.client.quit(); }

  async get(key: string): Promise<string | null> { return this.client.get(key); }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) return [];
    return this.client.mget(...keys);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) await this.client.setex(key, ttl, value);
    else await this.client.set(key, value);
  }

  async del(key: string): Promise<void> { await this.client.del(key); }

  // ── Presence tracking ────────────────────────────────────────────────────────

  async setPresence(userId: string): Promise<void> {
    await this.client.setex(`presence:user:${userId}`, PRESENCE_TTL, new Date().toISOString());
  }

  async getPresence(userId: string): Promise<string | null> {
    return this.client.get(`presence:user:${userId}`);
  }

  async getPresenceBulk(userIds: string[]): Promise<(string | null)[]> {
    if (!userIds.length) return [];
    const keys = userIds.map(id => `presence:user:${id}`);
    return this.client.mget(...keys);
  }

  // ── Operator ZSET ────────────────────────────────────────────────────────────

  async addToAvailable(userId: string, score: number): Promise<void> {
    await this.client.zadd(ZSET_KEY, score, userId);
  }

  async removeFromAvailable(userId: string): Promise<void> {
    await this.client.zrem(ZSET_KEY, userId);
  }

  async getAvailableOperators(): Promise<{ id: string; score: number }[]> {
    const result = await this.client.zrange(ZSET_KEY, 0, -1, 'WITHSCORES');
    const out: { id: string; score: number }[] = [];
    for (let i = 0; i < result.length; i += 2) {
      out.push({ id: result[i], score: parseFloat(result[i + 1]) });
    }
    return out;
  }

  async isInAvailable(userId: string): Promise<boolean> {
    const score = await this.client.zscore(ZSET_KEY, userId);
    return score !== null;
  }

  // ── Atomic status update using Lua (race condition prevention) ───────────────

  async atomicStatusUpdate(
    userId: string,
    newStatus: string,
    score: number,
  ): Promise<void> {
    const lua = `
      local zkey = KEYS[1]
      local uid  = ARGV[1]
      local stat = ARGV[2]
      local sc   = tonumber(ARGV[3])
      if stat == 'available' then
        redis.call('ZADD', zkey, sc, uid)
      else
        redis.call('ZREM', zkey, uid)
      end
      return 1
    `;
    await (this.client as any).eval(lua, 1, ZSET_KEY, userId, newStatus, score);
  }
}
