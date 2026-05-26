# auth-service — Port 3001

JWT autentifikatsiya servisi. Mijoz OTP, operator login, Nova SSO va Centrifugo token endpointlarini ta'minlaydi.

## Endpointlar

| Method | Path | Tavsif |
|--------|------|--------|
| POST | `/auth/register` | Mijoz ro'yxatdan o'tish (phone + OTP) |
| POST | `/auth/otp/send` | OTP yuborish (1/daq per phone) |
| POST | `/auth/otp/verify` | OTP tekshirish, JWT qaytarish |
| POST | `/auth/login` | Operator login (email + password) |
| POST | `/auth/refresh` | Access token yangilash |
| POST | `/auth/logout` | Token blacklist |
| GET | `/auth/me` | Joriy user ma'lumotlari |
| PATCH | `/auth/me/locale` | Tilni o'zgartirish (uz/ru) |
| POST | `/auth/centrifugo/token` | Centrifugo connection JWT |
| POST | `/auth/centrifugo/subscribe` | Centrifugo channel JWT |
| POST | `/auth/nova/sso` | Nova SSO (HMAC signature bilan) |
| GET | `/healthz` | Health check |
| GET | `/readyz` | Readiness check |
| GET | `/metrics` | Prometheus metrics |

## Muhit o'zgaruvchilar

```
DATABASE_URL=postgres://nova:nova_dev_pass@postgres:5432/nova_chat
REDIS_URL=redis://redis:6379
JWT_SECRET=32+ belgi
JWT_REFRESH_SECRET=32+ belgi
CENTRIFUGO_HMAC_SECRET=32+ belgi
NOVA_SHARED_SECRET=32+ belgi
PORT=3001
NODE_ENV=development
```

## Lokal ishga tushirish

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

## Test

```bash
npm test
npm run test:e2e
```

## JWT payload

```json
{
  "sub": "user_uuid",
  "role": "customer|operator|supervisor|admin",
  "locale": "uz",
  "iat": 1700000000,
  "exp": 1700003600
}
```

Access TTL: 1 soat | Refresh TTL: 30 kun (Redis rotation)

## Nova SSO

Nova HMAC signature bilan `X-Nova-Signature` headerini yuboradi.
Servis signature tekshiradi, user'ni topadi/yaratadi, JWT qaytaradi.
