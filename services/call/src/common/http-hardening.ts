import type { INestApplication } from '@nestjs/common';

/**
 * Barcha servislar uchun umumiy HTTP qattiqlashtirish:
 *  1. Xavfsizlik headerlari (helmet o'rniga — qo'shimcha bog'liqliksiz).
 *  2. IP bo'yicha sirpanuvchi oyna limiti (DoS va brute-force'ga qarshi birinchi to'siq).
 *
 * Eslatma: limiter jarayon xotirasida ishlaydi. Bir nechta nusxa (replica)
 * bo'lganda cheklov taxminiy bo'ladi; autentifikatsiyaga oid qat'iy limitlar
 * auth-service ichida Redis orqali alohida qo'yilgan.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MIN ?? 1200);
const MAX_TRACKED_IPS = 50_000;

type Bucket = { count: number; reset: number };

export function applyHttpHardening(app: INestApplication): void {
  const buckets = new Map<string, Bucket>();

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

    const ip =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const now = Date.now();
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
  });
}
