import type { INestApplication } from '@nestjs/common';

/**
 * Barcha servislar uchun umumiy HTTP qattiqlashtirish:
 *  1. Xavfsizlik headerlari (nosniff, DENY, no-referrer, HSTS).
 *  2. Taqsimlangan Redis va xotira asosidagi rate limiting (DDoS va brute-force'ga qarshi).
 *  3. Ishonchli reverse-proxy (Traefik) orqali IP olish (req.ip, trust proxy 1).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MIN ?? 1200);
const MAX_TRACKED_IPS = 50_000;

type Bucket = { count: number; reset: number };

let redisClient: any = null;
try {
  const Redis = require('ioredis');
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  if (redisUrl || redisHost) {
    redisClient = redisUrl
      ? new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })
      : new Redis({
          host: redisHost || 'redis',
          port: Number(process.env.REDIS_PORT || 6379),
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
    redisClient.connect().catch(() => {});
  }
} catch {}

export function applyHttpHardening(app: INestApplication): void {
  try {
    const expressApp = app.getHttpAdapter().getInstance();
    if (expressApp && typeof expressApp.set === 'function') {
      expressApp.set('trust proxy', 1);
    }
  } catch {}

  const buckets = new Map<string, Bucket>();

  const handleMemoryLimit = (ip: string, now: number, res: any, next: any) => {
    let bucket = buckets.get(ip);
    if (!bucket || bucket.reset <= now) {
      if (buckets.size >= MAX_TRACKED_IPS) buckets.clear();
      bucket = { count: 0, reset: now + WINDOW_MS };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((bucket.reset - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(
        JSON.stringify({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'So\'rovlar chegarasi oshib ketdi. Bir oz kutib qayta urinib ko\'ring',
        }),
      );
    }

    return next();
  };

  app.use((req: any, res: any, next: any) => {
    // ── 1. Xavfsizlik headerlari ────────────────────────────────────────────
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.removeHeader?.('X-Powered-By');

    // ── 2. Tezlik cheklovi ──────────────────────────────────────────────────
    // Healthcheck va metrikalar cheklanmaydi — monitoring buzilmasligi uchun
    const path: string = req.path ?? req.url ?? '';
    if (path === '/healthz' || path === '/readyz' || path === '/metrics') {
      return next();
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    if (redisClient && redisClient.status === 'ready') {
      const windowSec = Math.floor(now / WINDOW_MS);
      const redisKey = `ratelimit:${ip}:${windowSec}`;

      redisClient
        .incr(redisKey)
        .then((current: number) => {
          if (current === 1) {
            redisClient.pexpire(redisKey, WINDOW_MS * 2).catch(() => {});
          }
          const remaining = Math.max(0, MAX_REQUESTS - current);
          res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
          res.setHeader('X-RateLimit-Remaining', String(remaining));

          if (current > MAX_REQUESTS) {
            const resetTime = (windowSec + 1) * 60;
            const retryAfter = Math.max(1, resetTime - Math.floor(now / 1000));
            res.setHeader('Retry-After', String(retryAfter));
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(
              JSON.stringify({
                statusCode: 429,
                error: 'Too Many Requests',
                message: 'So\'rovlar chegarasi oshib ketdi. Bir oz kutib qayta urinib ko\'ring',
              }),
            );
          }
          return next();
        })
        .catch(() => {
          handleMemoryLimit(ip, now, res, next);
        });
      return;
    }

    handleMemoryLimit(ip, now, res, next);
  });
}
