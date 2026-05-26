# chat-service — Port 3002

Real-time xabar va xonalar servisi. ACD (Automatic Call Distribution) logikasi, Centrifugo publish va Meilisearch indeksatsiya.

## Endpointlar

| Method | Path | Tavsif |
|--------|------|--------|
| GET | `/rooms` | Xonalar ro'yxati (pagination) |
| POST | `/rooms` | Yangi xona yaratish |
| GET | `/rooms/:id` | Bitta xona |
| PATCH | `/rooms/:id` | Xonani yangilash |
| POST | `/rooms/:id/close` | Xonani yopish |
| GET | `/rooms/:id/messages` | Xabarlar (cursor pagination) |
| POST | `/rooms/:id/messages` | Yangi xabar yuborish |
| PATCH | `/messages/:id` | Xabarni tahrirlash |
| DELETE | `/messages/:id` | Xabarni o'chirish (soft delete) |
| POST | `/messages/:id/read` | O'qildi belgisi |
| POST | `/rooms/:id/typing` | "Yozyapti..." indikatori |
| GET | `/search` | Meilisearch orqali qidirish (uz+ru) |
| POST | `/support/request` | Mijoz support boshlaydi (ACD trigger) |
| GET | `/healthz` | Health check |
| GET | `/metrics` | Prometheus metrics |

## ACD logikasi

1. Mavjud support xona bormi tekshiradi
2. (Phase 10) Bot enabled bo'lsa — bot_handling
3. `operator_states` dan bo'sh, mijoz tilini biladigan operator topadi
4. Redis ZSET `operator:available` dan eng kam yuklangan oladi
5. Atomic Redis lock bilan race condition oldini oladi
6. Topilmasa — `pending` status, 15s interval qayta urinish

## Muhit o'zgaruvchilar

```
DATABASE_URL, REDIS_URL, RABBITMQ_URL
CENTRIFUGO_API_URL, CENTRIFUGO_API_KEY
MEILI_URL, MEILI_KEY
DEFAULT_LOCALE=uz, SUPPORTED_LOCALES=uz,ru
PORT=3002
```

## System messages

Barcha system xabarlar DB `system_message_templates` jadvalidan olinadi.
Har doim JSON `{"uz": "...", "ru": "..."}` formatida yuboriladi.
