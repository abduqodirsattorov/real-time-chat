# auth-service — Phase 2

NestJS + TypeScript + Prisma asosidagi autentifikatsiya mikroservisi.

## Endpoints (11 ta)

| Method | Path | Auth | Tavsif |
|--------|------|------|--------|
| POST | `/auth/register` | — | Yangi foydalanuvchi ro'yxatdan o'tkazish |
| POST | `/auth/otp/send` | — | OTP yuborish (console.log fallback) |
| POST | `/auth/otp/verify` | — | OTP tekshirish → JWT tokens |
| POST | `/auth/login` | — | Mavjud user uchun OTP yuborish |
| POST | `/auth/refresh` | — | Refresh token rotation |
| POST | `/auth/logout` | Bearer | Sessiyani yakunlash |
| GET | `/auth/me` | Bearer | Joriy foydalanuvchi ma'lumoti |
| PATCH | `/auth/me/locale` | Bearer | Tilni o'zgartirish |
| POST | `/auth/centrifugo/token` | Bearer | Centrifugo connection JWT |
| POST | `/auth/centrifugo/subscribe` | Bearer | Kanal subscribe JWT |
| POST | `/auth/nova/sso` | — | Nova (Laravel) SSO |
| GET | `/healthz` | — | Liveness probe |
| GET | `/readyz` | — | Readiness probe (DB + Redis) |

## JWT Payload

```json
{
  "sub": "user-uuid",
  "role": "customer|operator|supervisor|admin|bot",
  "locale": "uz|ru",
  "jti": "unique-token-id",
  "iat": 1700000000,
  "exp": 1700003600
}
```

## OTP

- 6 xonali tasodifiy raqam
- TTL: 5 daqiqa (Redis'da)
- Rate limit: 1 ta/daqiqa, 5 ta/kun (telefon boshiga)
- SMS provider yo'q — `console.log("[OTP] +998901234567: 123456")`

## Refresh Token Rotation + Theft Detection

- Refresh token: 30 kunlik JWT (alohida secret bilan)
- Redis'da saqlash: `auth:refresh:{jti}` → userId
- Foydalanilgan token qayta ishlatilsa → BARCHA sessiyalar o'chiriladi

## Nova SSO

```
HMAC-SHA256("{novaUserId}:{timestamp}", NOVA_SSO_SECRET)
```
- Timestamp toleransi: ±5 daqiqa (replay attack himoya)
- `external_id = "nova_{novaUserId}"`
- Mavjud bo'lmasa — yangi user yaratadi
- Mavjud bo'lsa — role/locale yangilaydi

## ENV vars

| O'zgaruvchi | Tavsif | Misol |
|-------------|--------|-------|
| DATABASE_URL | PostgreSQL URL | `postgresql://nova:pass@postgres:5432/nova_chat` |
| REDIS_HOST | Redis host | `redis` |
| REDIS_PORT | Redis port | `6379` |
| JWT_SECRET | Access token secret (min 32 belgi) | — |
| JWT_REFRESH_SECRET | Refresh token secret (min 32 belgi) | — |
| CENTRIFUGO_TOKEN_SECRET | Centrifugo JWT secret | — |
| NOVA_SSO_SECRET | Nova HMAC secret | — |
| PORT | Tinglash porti | `3001` |
| LOG_LEVEL | Pino log darajasi | `info` |
| LOG_PRETTY | Pino pretty print | `true` (faqat lokal) |

## Ishga tushirish

```bash
# Docker Compose orqali
docker compose up -d auth-service

# Lokal dev (Node.js kerak)
cd services/auth
cp ../../.env.example .env
npm install
npx prisma generate
npm run start:dev
```

## Testlar

```bash
make test-auth
# yoki lokal: cd services/auth && npm test
```

## Xavfsizlik

- JWT secret hech qachon kodga hardcode qilinmaydi
- Timing-safe HMAC taqqoslash (Nova SSO)
- Rate limiting Redis Counter orqali
- Refresh token theft detection
- Input validation: class-validator
- Correlation-ID: barcha request/response'larda
