# Nova Chat & Call Platform — Arxitektura

## Umumiy ko'rinish

```
┌──────────────────────────────────────────────────────────────────────┐
│                          KLIENTLAR                                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ Flutter Mobile  │  │ Nova Web (Vue)   │  │ Operator Softphone │  │
│  │ (Mijoz)         │  │ (Operator/Admin) │  │ (browser WebRTC)   │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬─────────┘  │
└───────────┼────────────────────┼───────────────────────┼────────────┘
            │ HTTPS/WSS          │ HTTPS/WSS             │ WSS+WebRTC
            ▼                    ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│              API GATEWAY (Traefik v3) — TLS termination               │
│              Port 80/443 — WebSocket aware routing                    │
└───────────┬──────────────────┬─────────────────┬─────────────────────┘
            │                  │                 │
    ┌───────▼──────┐  ┌────────▼────────┐  ┌────▼─────────┐
    │ Centrifugo   │  │ Microservices   │  │   LiveKit    │
    │ (WebSocket)  │◄─┤ (NestJS+TS)    │──┤  (Audio SFU) │
    │ Port 8000    │  │ Port 3001-3007  │  │  Port 7880   │
    └──────┬───────┘  └────────┬────────┘  └──────┬───────┘
           │                   │                  │
    ┌──────▼──────┐  ┌─────────▼──────────┐  ┌───▼──────────┐
    │   Redis 7   │  │  PostgreSQL 16 +   │  │    MinIO     │
    │  Port 6379  │  │  TimescaleDB       │  │  Port 9000   │
    └─────────────┘  │  Port 5432         │  └──────────────┘
                     └────────────────────┘
    ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  RabbitMQ   │  │ Meilisearch  │  │  Prometheus +    │
    │  Port 5672  │  │  Port 7700   │  │  Grafana + Loki  │
    └─────────────┘  └──────────────┘  └──────────────────┘

    [Phase 10] bot-gateway (port 3008) — RabbitMQ consumer
```

## Servislar

| Servis | Port | Texnologiya | Maqsad |
|--------|------|-------------|--------|
| auth-service | 3001 | NestJS | JWT, OTP, SSO |
| chat-service | 3002 | NestJS | Xabarlar, ACD, Meilisearch |
| presence-service | 3003 | NestJS | Operator holati, transfer targets |
| media-service | 3004 | NestJS + ffmpeg | Fayl upload, MinIO, thumbnail |
| call-service | 3005 | NestJS | LiveKit, transfer, recording flow |
| notification-service | 3006 | NestJS | FCM, APNs push |
| recording-service | 3007 | NestJS | LiveKit Egress, MinIO |
| bot-gateway | 3008 | NestJS | Phase 10 |

## Ma'lumot oqimlari

### Xabar yuborish

```
Flutter/Vue → POST /rooms/:id/messages (chat-service)
  → PostgreSQL INSERT
  → Centrifugo publish (chat:room#<id>)
  → RabbitMQ publish (message.created)
    → notification-service (push, agar offline)
    → bot.inbox (Phase 10)
    → meilisearch.index (indeksatsiya)
```

### Inbound qo'ng'iroq

```
Mijoz → POST /calls/initiate (call-service)
  → ACD: Redis ZSET → operator topish
  ├── Topildi:
  │   → LiveKit room yaratish
  │   → Operator'ga Centrifugo notification
  │   → Mijoz LiveKit token
  └── Topilmadi:
      → call_queue INSERT
      → hold_music play
      → 15s interval retry
```

### Recording flow

```
Operator → POST /calls/:id/recording/start
  → consent_announced = false
  → Centrifugo: play_audio (ikki tomonga)
  → Client audio chaladi
  → Client → POST /consent-ack
  → consent_announced = true
  → LiveKit Egress start → MinIO
```

## RabbitMQ Topology

**Exchange:** `nova.events` (topic, durable)

| Queue | Binding | Consumer |
|-------|---------|----------|
| `notification.push` | `message.created`, `call.initiated` | notification-service |
| `bot.inbox` | `message.created` | bot-gateway (Phase 10) |
| `audit.log` | `#` (barcha) | recording-service |
| `meilisearch.index` | `message.created` | chat-service |

## Xavfsizlik qoidalari

1. JWT HS256 (lokal), RS256 (production)
2. Refresh token rotation + theft detection
3. Recording faqat `consent_announced=true`
4. Recording access: operator+supervisor+admin only
5. Har kirish audit_logs'ga yoziladi
6. Centrifugo publish faqat backend orqali (client publish off)
7. MinIO `nova-recordings` public read off
8. CORS faqat allowed origins

## Kengayish imkoniyatlari (Production)

- Centrifugo: 3+ replica, sticky sessions
- LiveKit: 2+ node, regional clustering
- PostgreSQL: Patroni cluster
- Redis: Sentinel/Cluster
- MinIO → AWS S3 / Wasabi
- Kubernetes (Helm charts)
