# presence-service — Port 3003

Operator online/offline holati va transfer target servisi. Centrifugo webhook'larini qabul qiladi.

## Endpointlar

| Method | Path | Tavsif |
|--------|------|--------|
| GET | `/presence/users/:id` | Bitta user holati |
| POST | `/presence/users/bulk` | Ko'p user holati (batch) |
| POST | `/operator/status` | Operator statusini o'zgartirish |
| GET | `/operator/online` | Online operatorlar ro'yxati |
| GET | `/operator/transfer-targets` | Transfer uchun bo'sh operatorlar |
| POST | `/webhooks/centrifugo/connect` | Centrifugo connect event |
| POST | `/webhooks/centrifugo/disconnect` | Centrifugo disconnect event |
| GET | `/healthz` | Health check |
| GET | `/metrics` | Prometheus metrics |

## Redis keys

- `operator:available` — ZSET, score = active_chats (ACD uchun)
- `presence:user:<id>` — STRING, ISO timestamp (last_seen)

## Transfer targets logikasi

- Bo'sh operatorlar: status=available, on_call=false, mijoz tilini biladi
- Supervisorlar: available yoki busy bo'lsa ham (eskalatsiya uchun)
- Tartiblash: active_chats ASC (eng kam yuklangan birinchi)

## Muhit o'zgaruvchilar

```
DATABASE_URL, REDIS_URL
CENTRIFUGO_API_URL, CENTRIFUGO_API_KEY
PORT=3003
```
