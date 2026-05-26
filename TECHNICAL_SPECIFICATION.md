# Nova Chat & Call Platform — To'liq Texnik Spetsifikatsiya

**Versiya:** 1.1 (foydalanuvchi qarorlari bilan to'liq yangilangan)
**Sana:** 2026-yil
**Maqsad:** Telegram darajasidagi real-time chat + call center platformasini Nova (Laravel) dashboard va Flutter mobile ilova bilan integratsiya qilish.

---

## 0. AI Agent uchun ko'rsatma (READ FIRST)

Bu dokument **AI coding agent** (Claude Code, Cursor, GPT, Devin va h.k.) tomonidan o'qilib, butun sistemani **lokal kompyuterda** noldan qurish uchun mo'ljallangan. Quyidagi tartibni qat'iy bajaring:

1. **Section 1-4** — kontekst va arxitektura. Tushunmasdan kod yozmang.
2. **Section 5** — `docker-compose up` bilan barcha servislarni ko'taring.
3. **Section 6** — Database migration'larini ishga tushiring.
4. **Section 7** — Backend mikroservislarni shu tartibda yozing: Auth → Chat → Presence → Media → Call → Notification → Recording.
5. **Section 8** — LiveKit konfiguratsiya.
6. **Section 9** — Nova (Laravel) tomonida integratsiya.
7. **Section 10** — Flutter mobile app.
8. **Section 11** — i18n (o'zbek + rus).
9. **Section 12-13** — Xavfsizlik, monitoring va testing.
10. **Section 18** — Phase plan (jadval).

**Muhim qoidalar:**
- Hech narsani "soddalik uchun" tashlab ketmang. Har bir komponent kerak.
- Mock data ishlatmang — har bir endpoint real DB bilan ishlasin.
- Har bir servis uchun Dockerfile + healthcheck + README yozing.
- Har bir API endpoint uchun OpenAPI schema + test yozing.
- Loglar structured JSON (Pino/Zap formati), correlation_id bilan.
- Secrets `.env` faylida, hech qachon kodga hardcode qilmang.
- **Bot uchun joy qoldiring** — Phase 1'da to'liq qilmasak ham, schema va event bus tayyor bo'lsin.

---

## 1. Biznes konteksti

### 1.1. Foydalanuvchilar
- **Operator** — Nova dashboard'da ishlaydi (web), mijozlar bilan chat qiladi, qo'ng'iroqlarni qabul qiladi.
- **Supervisor / Manager** — Operatorlardan ko'ra ko'proq huquq: transfer target bo'la oladi.
- **Mijoz** — Flutter mobile ilovadan foydalanadi (telefon raqami yo'q, ilova ichida qo'ng'iroq).
- **Admin** — Nova'da operatorlarni boshqaradi, statistikani ko'radi.
- **Bot** (Phase 10) — virtual operator, AI yoki FAQ-based.

### 1.2. Asosiy use case'lar

**Hozirgi versiya (Phase 1-9):**
1. **Mijoz → Operator chat:** Mijoz yozadi, sistema bo'sh operatorni topadi va biriktiradi (ACD).
2. **Mijoz → Operator app-call:** Mijoz ilovadagi "📞" tugmasini bosadi. Band bo'lsa — navbatga qo'yadi, "On hold" musiqa. **PSTN yo'q, faqat ilova ichida (WebRTC).**
3. **Operator → Mijoz outbound:** Operator istalgan mijozga qo'ng'iroq qiladi. Mijoz ilovasi ringtone chaladi (CallKit/ConnectionService orqali background'da ham).
4. **Call transfer (yo'naltirish):** Operator qo'ng'iroqni boshqa operator yoki supervisor'ga uzata oladi. 2 xil:
   - **Cold transfer** (blind) — to'g'ridan-to'g'ri otadi
   - **Warm transfer** (attended) — avval boshqa operator bilan gaplashadi
5. **Fayl almashinuv:** Rasm, video, hujjat, ovoz xabar.
6. **Chat tarixi:** Mijoz va operator suhbat tarixini ko'ra oladi.
7. **Recording on demand:** Operator "⏺ Record" bossa — ovozli ogohlantirish chiqadi ("Bu qo'ng'iroq sifat nazorati uchun yozilmoqda"), keyin yozish boshlanadi.

**Kelajak versiyalar (Phase 10+):**
8. **Bot:** AI assistant operatordan oldin javob beradi.
9. **KPI dashboard:** Response time, AHT, CSAT, NPS.

### 1.3. Hajm (1 yil prognoz)
- 100,000+ ro'yxatdan o'tgan mijoz
- ~10,000 concurrent online mijoz (peak)
- ~500-2,000 operator
- ~50-200 parallel qo'ng'iroq (peak)
- ~1M xabar/kun

### 1.4. Til
- **UI:** O'zbek (lotin) + Rus
- Foydalanuvchi profilda tanlaydi (default: o'zbek lotin)
- Server xabarlari (system messages, push notification) ham 2 tilda
- i18n key-based (i18next standardi) — keyin yangi til oson qo'shiladi

---

## 2. Texnologiya tanlovi

### 2.1. Stack

| Komponent | Tanlov | Sabab |
|---|---|---|
| **WebSocket server** | **Centrifugo** (Go) | Bitta node 1M+ connection, Laravel/Flutter SDK |
| **Backend** | **NestJS** (Node.js + TS) | Tez, async, scalable |
| **Audio/Media** | **LiveKit** (Go) | WebRTC SFU, recording built-in, oson SDK |
| **PSTN** | **YO'Q** | Foydalanuvchi qarori: faqat ilova ichida |
| **Push** | **FCM** + **APNs** | CallKit/ConnectionService |
| **Storage** | **MinIO** | S3-compatible, fayllar+recording |
| **Database** | **PostgreSQL 16** + **TimescaleDB** | Time-series xabarlar uchun |
| **Cache/PubSub** | **Redis 7** | Presence, session |
| **Search** | **Meilisearch** | Multilingual (uz+ru) |
| **Queue/Event bus** | **RabbitMQ** | Bot integration uchun ham (Phase 10) |
| **Gateway** | **Traefik** v3 | WebSocket aware |
| **Mobile** | **Flutter** + Centrifuge + LiveKit | Native performance |
| **Nova** | **Laravel Echo** + Vue Tool | Mavjud Nova o'zgarmaydi |
| **Monitoring** | **Prometheus** + Grafana + Loki | Standard |

### 2.2. Eski versiyadan farq: FreeSWITCH olib tashlandi
PSTN bo'lmagani uchun FreeSWITCH/Kamailio kerak emas. **LiveKit yetarli:**
- Audio call (1-1 va 1-N)
- Recording (Egress)
- Call transfer (room manipulation)
- Hold music (client-side audio)
- ACD queue logikasi — call-service ichida

Bu **3 hafta vaqtni tejaydi** va arxitekturani 30% soddalashtiradi.

### 2.3. Nima uchun hammasini Laravel'da yozmaymiz?
PHP per-request modelda ishlaydi — real-time uchun samarasiz. 10K WebSocket'ga 10x ko'p server kerak. Shuning uchun:
- **Nova/Laravel** = biznes logika, admin panel, CRUD
- **NestJS + Centrifugo + LiveKit** = real-time qism

Ular REST + Redis Pub/Sub + RabbitMQ orqali gaplashadi.

---

## 3. Yuqori darajadagi arxitektura

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
│              API GATEWAY (Traefik) — TLS termination                  │
└───────────┬──────────────────┬─────────────────┬─────────────────────┘
            │                  │                 │
    ┌───────▼──────┐  ┌────────▼────────┐  ┌────▼─────────┐
    │ Centrifugo   │  │ Microservices   │  │   LiveKit    │
    │ (WebSocket)  │◄─┤ (NestJS)        │──┤  (Audio SFU) │
    └──────┬───────┘  └────────┬────────┘  └──────┬───────┘
           │                   │                  │
    ┌──────▼──▼──┐  ┌──────────▼─────────┐  ┌─────▼────────┐
    │   Redis    │  │  PostgreSQL 16 +   │  │    MinIO     │
    └────────────┘  │  TimescaleDB       │  │ (files+rec)  │
                    └────────────────────┘  └──────────────┘
    ┌────────────┐  ┌──────────────┐  ┌──────────────┐
    │ RabbitMQ   │  │ Meilisearch  │  │  Prometheus  │
    │ (events,   │  │ (uz+ru)      │  │ + Grafana    │
    │  bot bus)  │  │              │  │ + Loki       │
    └────────────┘  └──────────────┘  └──────────────┘

    ┌──────────────────────────────────────────────────────┐
    │  Nova (Laravel) — REST + Echo client                  │
    └──────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │  [Phase 10] bot-service — RabbitMQ orqali xabar       │
    │  ushlaydi, AI/FAQ javob, eskalatsiya operator'ga      │
    └──────────────────────────────────────────────────────┘
```

### 3.1. Ma'lumot oqimi: "Mijoz xabar yuboradi"
1. Flutter → `POST /api/v1/messages` (chat-service)
2. chat-service PostgreSQL'ga yozadi
3. chat-service Centrifugo'ga publish: `chat:room#{room_id}`
4. chat-service RabbitMQ'ga `message.created` event (bot-service Phase 10'da ushlaydi)
5. Centrifugo subscriber'larga push qiladi
6. Oluvchi offline bo'lsa — notification-service FCM/APNs push yuboradi
7. Nova Echo client kanalga ulangan — operator real-time ko'radi

### 3.2. Ma'lumot oqimi: "Mijoz qo'ng'iroq qiladi"
1. Flutter → `POST /api/v1/calls/initiate` `{ type: 'audio' }`
2. call-service Redis'dan bo'sh operatorni topadi (`operator:available` ZSET)
3. Topilmasa — navbatga qo'yadi, "Hold music" track yuboradi (client-side)
4. Topilsa — LiveKit room yaratadi, ikkalasi uchun JWT token
5. Operator browser'i Centrifugo orqali notification oladi → ringtone → "Accept"
6. Mijoz va operator LiveKit'ga ulanadi, audio oqim boshlanadi
7. Operator "⏺ Record" bossa → audio prompt → recording boshlanadi
8. Qo'ng'iroq tugaganda — CDR PostgreSQL'ga yoziladi

### 3.3. Ma'lumot oqimi: "Call transfer"
1. Operator A `POST /calls/:id/transfer` `{ to_operator_id, type: 'warm'|'cold' }`
2. **Cold transfer:**
   - LiveKit room'da Operator A disconnect, Operator B invite
   - Mijozga "Sizni boshqa operatorga ulanmoqda" system message
3. **Warm transfer:**
   - Yangi LiveKit "consult" room (operator A + operator B)
   - Mijoz "on hold" qoladi (hold music)
   - Ular gaplashadi → "Complete transfer" → mijoz Operator B bilan asosiy room'da

---

## 4. Servislar va portlar (lokal)

| Servis | Port | Maqsad |
|---|---|---|
| Traefik | 80, 443, 8080 | API Gateway |
| Centrifugo | 8000 | Real-time WebSocket |
| auth-service | 3001 | JWT auth |
| chat-service | 3002 | Xabarlar, room'lar |
| presence-service | 3003 | Online/offline status |
| media-service | 3004 | Fayl upload/download |
| call-service | 3005 | Call routing, transfer, CDR |
| notification-service | 3006 | FCM/APNs push |
| recording-service | 3007 | LiveKit egress, S3 upload |
| bot-gateway (Phase 10) | 3008 | Bot event bus, AI router |
| LiveKit | 7880, 7881, 50000-60000 UDP | Audio SFU |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache/PubSub |
| MinIO | 9000, 9001 | Object storage |
| Meilisearch | 7700 | Search |
| RabbitMQ | 5672, 15672 | Queue/Event bus |
| Prometheus | 9090 | Metrics |
| Grafana | 3000 | Dashboards |
| Loki | 3100 | Logs |

---

## 5. Docker Compose (lokal setup)

`docker-compose.yml`:

```yaml
version: '3.9'

networks:
  nova-net:
    driver: bridge

volumes:
  pg_data:
  redis_data:
  minio_data:
  rabbitmq_data:
  meili_data:
  prom_data:
  grafana_data:
  loki_data:

services:

  # ─── Infrastructure ───────────────────────────────
  postgres:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_USER: nova
      POSTGRES_PASSWORD: nova_dev_pass
      POSTGRES_DB: nova_chat
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports: ["5432:5432"]
    networks: [nova-net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nova"]
      interval: 5s

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports: ["6379:6379"]
    networks: [nova-net]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    volumes:
      - minio_data:/data
    ports: ["9000:9000", "9001:9001"]
    networks: [nova-net]

  minio-init:
    image: minio/mc:latest
    depends_on: [minio]
    networks: [nova-net]
    entrypoint: >
      /bin/sh -c "
      sleep 5;
      mc alias set local http://minio:9000 minioadmin minioadmin123;
      mc mb -p local/nova-media || true;
      mc mb -p local/nova-recordings || true;
      mc anonymous set download local/nova-media || true;
      "

  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: nova
      RABBITMQ_DEFAULT_PASS: nova_dev_pass
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    ports: ["5672:5672", "15672:15672"]
    networks: [nova-net]

  meilisearch:
    image: getmeili/meilisearch:v1.10
    environment:
      MEILI_MASTER_KEY: nova_dev_master_key
    volumes:
      - meili_data:/meili_data
    ports: ["7700:7700"]
    networks: [nova-net]

  # ─── Real-time WebSocket ──────────────────────────
  centrifugo:
    image: centrifugo/centrifugo:v5
    command: centrifugo -c /centrifugo/config.json
    volumes:
      - ./infra/centrifugo/config.json:/centrifugo/config.json
    ports: ["8000:8000"]
    networks: [nova-net]
    depends_on: [redis]

  # ─── Audio / WebRTC ───────────────────────────────
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    network_mode: host
    volumes:
      - ./infra/livekit/livekit.yaml:/etc/livekit.yaml
    restart: unless-stopped

  livekit-egress:
    image: livekit/egress:latest
    environment:
      EGRESS_CONFIG_FILE: /etc/egress.yaml
    volumes:
      - ./infra/livekit/egress.yaml:/etc/egress.yaml
    network_mode: host
    restart: unless-stopped
    depends_on: [livekit]

  # ─── Microservices ────────────────────────────────
  auth-service:
    build: ./services/auth
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      REDIS_URL: redis://redis:6379
      JWT_SECRET: change_this_in_production_32_chars_min_xxx
      CENTRIFUGO_HMAC_SECRET: centrifugo_hmac_secret_change_me_32chars
      NOVA_SHARED_SECRET: nova_sso_shared_secret_change_me_32chars
    ports: ["3001:3001"]
    networks: [nova-net]
    depends_on: [postgres, redis]

  chat-service:
    build: ./services/chat
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://nova:nova_dev_pass@rabbitmq:5672
      CENTRIFUGO_API_URL: http://centrifugo:8000/api
      CENTRIFUGO_API_KEY: centrifugo_api_key_change_me
      MEILI_URL: http://meilisearch:7700
      MEILI_KEY: nova_dev_master_key
      DEFAULT_LOCALE: uz
      SUPPORTED_LOCALES: uz,ru
    ports: ["3002:3002"]
    networks: [nova-net]
    depends_on: [postgres, redis, centrifugo, rabbitmq]

  presence-service:
    build: ./services/presence
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      REDIS_URL: redis://redis:6379
      CENTRIFUGO_API_URL: http://centrifugo:8000/api
      CENTRIFUGO_API_KEY: centrifugo_api_key_change_me
    ports: ["3003:3003"]
    networks: [nova-net]

  media-service:
    build: ./services/media
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      MINIO_ENDPOINT: minio:9000
      MINIO_PUBLIC_ENDPOINT: http://localhost:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin123
      MINIO_BUCKET: nova-media
    ports: ["3004:3004"]
    networks: [nova-net]
    depends_on: [postgres, minio]

  call-service:
    build: ./services/call
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://nova:nova_dev_pass@rabbitmq:5672
      CENTRIFUGO_API_URL: http://centrifugo:8000/api
      CENTRIFUGO_API_KEY: centrifugo_api_key_change_me
      LIVEKIT_HOST: http://host.docker.internal:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_SECRET: devsecret_change_me_32_chars_minimum_xx
      RECORDING_ANNOUNCEMENT_URL_UZ: http://minio:9000/nova-media/sys/recording_uz.mp3
      RECORDING_ANNOUNCEMENT_URL_RU: http://minio:9000/nova-media/sys/recording_ru.mp3
      HOLD_MUSIC_URL: http://minio:9000/nova-media/sys/hold_music.mp3
    ports: ["3005:3005"]
    networks: [nova-net]
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on: [postgres, redis, rabbitmq, centrifugo]

  notification-service:
    build: ./services/notification
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://nova:nova_dev_pass@rabbitmq:5672
      FCM_SERVICE_ACCOUNT_PATH: /secrets/fcm-service-account.json
      APNS_KEY_PATH: /secrets/apns.p8
      APNS_KEY_ID: ${APNS_KEY_ID:-}
      APNS_TEAM_ID: ${APNS_TEAM_ID:-}
      APNS_TOPIC: com.nova.app
      APNS_VOIP_TOPIC: com.nova.app.voip
    volumes:
      - ./secrets:/secrets:ro
    ports: ["3006:3006"]
    networks: [nova-net]
    depends_on: [postgres, redis, rabbitmq]

  recording-service:
    build: ./services/recording
    environment:
      DATABASE_URL: postgres://nova:nova_dev_pass@postgres:5432/nova_chat
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin123
      MINIO_BUCKET: nova-recordings
      LIVEKIT_HOST: http://host.docker.internal:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_SECRET: devsecret_change_me_32_chars_minimum_xx
    ports: ["3007:3007"]
    networks: [nova-net]
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on: [postgres, minio]

  # ─── Gateway ─────────────────────────────────────
  traefik:
    image: traefik:v3.0
    command:
      - --api.insecure=true
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
    ports: ["80:80", "443:443", "8080:8080"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [nova-net]

  # ─── Monitoring ───────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prom_data:/prometheus
    ports: ["9090:9090"]
    networks: [nova-net]

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./infra/grafana/provisioning:/etc/grafana/provisioning
    ports: ["3000:3000"]
    networks: [nova-net]

  loki:
    image: grafana/loki:latest
    command: -config.file=/etc/loki/local-config.yaml
    volumes:
      - loki_data:/loki
    ports: ["3100:3100"]
    networks: [nova-net]
```

### 5.1. Centrifugo config (`infra/centrifugo/config.json`)

```json
{
  "token_hmac_secret_key": "centrifugo_hmac_secret_change_me_32chars",
  "api_key": "centrifugo_api_key_change_me",
  "admin": true,
  "admin_password": "admin",
  "admin_secret": "admin_secret_change_me_32chars_xx",
  "allowed_origins": ["*"],
  "namespaces": [
    {
      "name": "chat",
      "presence": true,
      "join_leave": true,
      "history_size": 100,
      "history_ttl": "168h",
      "force_recovery": true,
      "allow_subscribe_for_client": true,
      "allow_publish_for_client": false
    },
    { "name": "presence", "presence": true },
    { "name": "call", "history_size": 10, "history_ttl": "1h" }
  ],
  "engine": "redis",
  "redis_address": "redis:6379",
  "websocket": true,
  "websocket_compression": true,
  "log_level": "info",
  "prometheus": true
}
```

### 5.2. LiveKit config (`infra/livekit/livekit.yaml`)

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
keys:
  devkey: devsecret_change_me_32_chars_minimum_xx
room:
  auto_create: false
  max_participants: 10
  empty_timeout: 60
  departure_timeout: 20
redis:
  address: redis:6379
logging:
  level: info
turn:
  enabled: true
  domain: localhost
  tls_port: 5349
  udp_port: 3478
```

### 5.3. RabbitMQ topology

**Exchange:** `nova.events` (topic)

**Routing keys:**
- `message.created`, `message.deleted`
- `room.assigned`
- `call.initiated`, `call.connected`, `call.transferred`, `call.ended`
- `call.recording.started`, `call.recording.completed`
- `operator.status.changed`

**Queues:**
- `notification.push` ← `message.created`, `call.initiated`
- `bot.inbox` ← `message.created` (**Phase 10**'da bot-gateway consume qiladi)
- `audit.log` ← `#` (barcha)
- `meilisearch.index` ← `message.created`

Servislar boot'da exchange/queue'larni avtomatik yaratadi (idempotent).

---

## 6. Database schema

`infra/postgres/init.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ── Users ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('customer', 'operator', 'supervisor', 'admin', 'bot');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE user_locale AS ENUM ('uz', 'ru');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id   VARCHAR(64) UNIQUE,
  phone         VARCHAR(32) UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  full_name     VARCHAR(255),
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'customer',
  status        user_status NOT NULL DEFAULT 'active',
  locale        user_locale NOT NULL DEFAULT 'uz',
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_role ON users(role) WHERE status = 'active';
CREATE INDEX idx_users_external ON users(external_id);

-- ── Devices (push tokens) ─────────────────────────
CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web');

CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      device_platform NOT NULL,
  push_token    TEXT NOT NULL,
  voip_token    TEXT,
  device_name   VARCHAR(255),
  app_version   VARCHAR(32),
  locale        user_locale,
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, push_token)
);
CREATE INDEX idx_devices_user ON devices(user_id);

-- ── Rooms ─────────────────────────────────────────
CREATE TYPE room_type AS ENUM ('direct', 'support', 'transfer_consult');
CREATE TYPE room_status AS ENUM ('open', 'closed', 'pending', 'bot_handling');

CREATE TABLE rooms (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                 room_type NOT NULL,
  status               room_status NOT NULL DEFAULT 'open',
  title                VARCHAR(255),
  customer_id          UUID REFERENCES users(id),
  operator_id          UUID REFERENCES users(id),
  previous_operator_id UUID REFERENCES users(id),
  last_message_at      TIMESTAMPTZ,
  bot_handled          BOOLEAN DEFAULT FALSE,
  escalated_at         TIMESTAMPTZ,
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ
);
CREATE INDEX idx_rooms_customer ON rooms(customer_id);
CREATE INDEX idx_rooms_operator ON rooms(operator_id) WHERE status = 'open';
CREATE INDEX idx_rooms_status ON rooms(status, last_message_at DESC);

CREATE TABLE room_members (
  room_id              UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at              TIMESTAMPTZ,
  last_read_message_id UUID,
  muted                BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (room_id, user_id)
);

-- ── Messages (TimescaleDB hypertable) ─────────────
CREATE TYPE message_type AS ENUM (
  'text', 'image', 'video', 'audio', 'file', 'voice',
  'system', 'call_log',
  'bot_card', 'bot_quick_reply'
);

CREATE TABLE messages (
  id             UUID NOT NULL DEFAULT uuid_generate_v4(),
  room_id        UUID NOT NULL,
  sender_id      UUID NOT NULL,
  type           message_type NOT NULL DEFAULT 'text',
  content        TEXT,
  content_locale user_locale,
  attachment_id  UUID,
  reply_to_id    UUID,
  edited_at      TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
);

SELECT create_hypertable('messages', 'created_at', chunk_time_interval => INTERVAL '7 days');
CREATE INDEX idx_messages_room ON messages(room_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);

-- ── Receipts ──────────────────────────────────────
CREATE TABLE message_receipts (
  message_id    UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  PRIMARY KEY (message_id, user_id)
);

-- ── System message templates (i18n) ───────────────
CREATE TABLE system_message_templates (
  key           VARCHAR(64) PRIMARY KEY,
  template_uz   TEXT NOT NULL,
  template_ru   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_message_templates (key, template_uz, template_ru) VALUES
  ('operator.joined',        'Operator {name} suhbatga qoshildi',          'Оператор {name} присоединился к чату'),
  ('operator.left',          'Operator {name} suhbatdan chiqdi',           'Оператор {name} покинул чат'),
  ('transfer.started',       'Sizni boshqa operatorga ulanmoqda...',       'Вас переключают на другого оператора...'),
  ('transfer.completed',     'Endi operator {name} sizga yordam beradi',   'Теперь оператор {name} помогает вам'),
  ('call.recording.started', 'Bu qongiroq sifat nazorati uchun yozilmoqda','Этот звонок записывается в целях контроля качества'),
  ('call.recording.stopped', 'Yozish toxtatildi',                          'Запись остановлена'),
  ('call.queued',            'Operator topilmoqda, kuting...',             'Поиск оператора, подождите...'),
  ('call.no_operator',       'Hozircha bosh operator yoq. Iltimos, keyinroq qayta urinib koring', 'Сейчас нет свободных операторов. Попробуйте позже'),
  ('room.closed',            'Suhbat yopildi',                             'Чат закрыт'),
  ('bot.handoff',            'Operator bilan ulanyapsiz...',               'Соединяю с оператором...');

-- ── Attachments ───────────────────────────────────
CREATE TABLE attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id   UUID NOT NULL REFERENCES users(id),
  storage_key   VARCHAR(512) NOT NULL,
  mime_type     VARCHAR(128) NOT NULL,
  file_name     VARCHAR(512) NOT NULL,
  size_bytes    BIGINT NOT NULL,
  width         INT,
  height        INT,
  duration_ms   INT,
  thumbnail_key VARCHAR(512),
  checksum      VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Operator states ───────────────────────────────
CREATE TYPE operator_status AS ENUM ('offline', 'available', 'busy', 'away', 'on_call', 'in_transfer');

CREATE TABLE operator_states (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status               operator_status NOT NULL DEFAULT 'offline',
  active_chats         INT NOT NULL DEFAULT 0,
  max_concurrent_chats INT NOT NULL DEFAULT 5,
  on_call              BOOLEAN NOT NULL DEFAULT FALSE,
  current_call_id      UUID,
  last_status_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  skills               TEXT[] DEFAULT '{}',
  languages            user_locale[] DEFAULT '{uz}',
  is_supervisor        BOOLEAN DEFAULT FALSE
);

-- ── Calls (CDR) ───────────────────────────────────
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound', 'internal');
CREATE TYPE call_status AS ENUM (
  'initiating', 'ringing', 'queued', 'connected',
  'on_hold', 'transferring',
  'completed', 'failed', 'no_answer', 'canceled'
);

CREATE TABLE calls (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caller_id           UUID REFERENCES users(id),
  callee_id           UUID REFERENCES users(id),
  direction           call_direction NOT NULL,
  status              call_status NOT NULL DEFAULT 'initiating',
  livekit_room        VARCHAR(255),
  queue_wait_ms       INT,
  ring_duration_ms    INT,
  talk_duration_ms    INT,
  hangup_cause        VARCHAR(64),
  hangup_by           UUID REFERENCES users(id),
  recording_id        UUID,
  metadata            JSONB DEFAULT '{}',
  initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at         TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ
);
CREATE INDEX idx_calls_caller ON calls(caller_id, initiated_at DESC);
CREATE INDEX idx_calls_callee ON calls(callee_id, initiated_at DESC);
CREATE INDEX idx_calls_status ON calls(status) WHERE status IN ('queued', 'ringing', 'connected', 'on_hold');

-- ── Call transfers ────────────────────────────────
CREATE TYPE transfer_type AS ENUM ('cold', 'warm');
CREATE TYPE transfer_status AS ENUM ('initiated', 'consulting', 'completed', 'failed', 'canceled');

CREATE TABLE call_transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  from_operator   UUID NOT NULL REFERENCES users(id),
  to_operator     UUID NOT NULL REFERENCES users(id),
  type            transfer_type NOT NULL,
  status          transfer_status NOT NULL DEFAULT 'initiated',
  consult_room    VARCHAR(255),
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ── Call queue ────────────────────────────────────
CREATE TABLE call_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id           UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  priority          SMALLINT NOT NULL DEFAULT 0,
  required_skills   TEXT[] DEFAULT '{}',
  required_language user_locale,
  enqueued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at       TIMESTAMPTZ,
  assigned_to       UUID REFERENCES users(id)
);
CREATE INDEX idx_queue_pending ON call_queue(priority DESC, enqueued_at ASC) WHERE assigned_at IS NULL;

-- ── Recordings ────────────────────────────────────
CREATE TYPE recording_status AS ENUM ('starting', 'active', 'processing', 'completed', 'failed');

CREATE TABLE recordings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id           UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  started_by        UUID NOT NULL REFERENCES users(id),
  consent_announced BOOLEAN NOT NULL DEFAULT FALSE,
  status            recording_status NOT NULL DEFAULT 'starting',
  storage_key       VARCHAR(512),
  duration_ms       INT,
  size_bytes        BIGINT,
  egress_id         VARCHAR(255),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at        TIMESTAMPTZ,
  failed_reason     TEXT
);
CREATE INDEX idx_recordings_call ON recordings(call_id);

-- ── Audit log ─────────────────────────────────────
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES users(id),
  action        VARCHAR(128) NOT NULL,
  target_type   VARCHAR(64),
  target_id     UUID,
  payload       JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);

-- ── Bot configs (PHASE 10 stub) ───────────────────
CREATE TABLE bot_configs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(128) NOT NULL,
  type              VARCHAR(32) NOT NULL,
  enabled           BOOLEAN DEFAULT FALSE,
  config            JSONB DEFAULT '{}',
  fallback_to_human BOOLEAN DEFAULT TRUE,
  handoff_keywords  TEXT[] DEFAULT ARRAY['operator', 'оператор', 'odam', 'человек'],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rooms SET last_message_at = NEW.created_at WHERE id = NEW.room_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_update_room
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_room_last_message();
```

---

## 7. Mikroservislar — batafsil

Har bir servis NestJS + TypeScript + Prisma. Folder:

```
services/<name>/
├── Dockerfile
├── package.json
├── tsconfig.json
├── prisma/schema.prisma
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── modules/
│   ├── common/ (filters, guards, i18n)
│   └── config/
├── locales/uz.json, ru.json
├── test/
└── README.md
```

### 7.1. auth-service (port 3001)

| Method | Path | Maqsad |
|---|---|---|
| POST | `/auth/register` | Mijoz register (phone + OTP) |
| POST | `/auth/otp/send` | OTP yuborish |
| POST | `/auth/otp/verify` | OTP verify, JWT |
| POST | `/auth/login` | Operator login (email+password) |
| POST | `/auth/refresh` | Refresh token |
| POST | `/auth/logout` | Token blacklist |
| GET | `/auth/me` | Joriy user |
| PATCH | `/auth/me/locale` | Tilni o'zgartirish |
| POST | `/auth/centrifugo/token` | Centrifugo JWT |
| POST | `/auth/centrifugo/subscribe` | Channel JWT |
| POST | `/auth/nova/sso` | Nova SSO (HMAC) |

**JWT payload:**
```json
{
  "sub": "user_uuid",
  "role": "customer|operator|supervisor|admin",
  "locale": "uz",
  "iat": 1700000000,
  "exp": 1700003600
}
```

Access TTL: 1 soat. Refresh TTL: 30 kun (Redis'da rotation, theft detection).

**Nova SSO:**
```
POST /auth/nova/sso
X-Nova-Signature: hmac_sha256(payload, NOVA_SHARED_SECRET)
Body: {
  "nova_user_id": 123,
  "email": "...",
  "full_name": "...",
  "role": "operator",
  "locale": "uz",
  "ts": 1700000000
}
```

Service signature tekshiradi, `users.external_id = 'nova_123'` izlaydi yoki yaratadi, JWT qaytaradi.

### 7.2. chat-service (port 3002)

| Method | Path | Maqsad |
|---|---|---|
| GET | `/rooms` | Xonalar ro'yxati |
| POST | `/rooms` | Yangi xona |
| GET | `/rooms/:id` | Bitta xona |
| PATCH | `/rooms/:id` | Yangilash |
| POST | `/rooms/:id/close` | Yopish |
| GET | `/rooms/:id/messages` | Xabarlar (cursor pagination) |
| POST | `/rooms/:id/messages` | Yangi xabar |
| PATCH | `/messages/:id` | Tahrirlash |
| DELETE | `/messages/:id` | O'chirish (soft) |
| POST | `/messages/:id/read` | O'qildi belgisi |
| POST | `/rooms/:id/typing` | "Yozyapti" |
| GET | `/search` | Meilisearch |
| POST | `/support/request` | Mijoz support boshlaydi (ACD) |

**System message i18n logikasi:**

```typescript
async sendSystemMessage(roomId: string, key: string, vars: Record<string,string>) {
  const template = await this.db.systemMessageTemplates.findUnique({ where: { key } });
  if (!template) throw new Error(`Unknown system message key: ${key}`);

  const content = {
    uz: this.interpolate(template.template_uz, vars),
    ru: this.interpolate(template.template_ru, vars),
  };

  return this.createMessage({
    roomId,
    senderId: SYSTEM_USER_ID,
    type: 'system',
    content: JSON.stringify(content),
  });
}

private interpolate(template: string, vars: Record<string,string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
```

Client (Flutter/Vue) `type === 'system'` ko'rsa, `content` JSON'ni parse qilib user locale'iga ko'ra tanlaydi.

**Xabar yuborish flow:**

```
POST /rooms/:id/messages
{
  "type": "text",
  "content": "Salom",
  "reply_to_id": null,
  "client_message_id": "uuid"
}

Service:
1. Auth guard: user shu room a'zosimi?
2. Idempotency: client_message_id Redis SET NX EX 86400 ('msg:idem:<id>')
3. INSERT messages
4. Centrifugo publish: chat:room#<id>
5. RabbitMQ publish: nova.events
   routing_key='message.created'
   payload={room_id, message_id, sender_id, type, ...}
6. Response: 201 + message DTO
```

**ACD flow:**

```
POST /support/request
{ initial_message: "salom" }

1. Mijoz uchun ochiq support room bormi tekshiradi.
2. (Phase 10) Bot enabled bo'lsa:
   - room.status='bot_handling'
   - RabbitMQ message.created (bot.inbox queue)
   - Bot uddalamasa → 4-qadamdan davom
3. operator_states.findMany WHERE
   status='available' AND on_call=false AND active_chats<max_concurrent_chats
4. Til filter: mijoz.locale = ANY(operator.languages)
5. Skill filter (agar bo'lsa)
6. Eng kam yuklangan operator (Redis ZSET 'operator:available' score=load)
7. Hech kim bo'sh emas:
   - room.status='pending'
   - Supervisor channel'ga notification
   - Background job har 15s qayta urinish
8. Operator topilsa:
   - room.operator_id=<id>
   - room.status='open'
   - operator_states.active_chats++
   - System message: 'operator.joined' (operator ismi bilan)
   - Operator channel'ga 'new_room_assigned' publish
```

### 7.3. presence-service (port 3003)

| Method | Path | Maqsad |
|---|---|---|
| GET | `/presence/users/:id` | Bitta status |
| POST | `/presence/users/bulk` | Ko'p user |
| POST | `/operator/status` | Status o'zgartirish |
| GET | `/operator/online` | Online ro'yxati |
| GET | `/operator/transfer-targets` | Transfer uchun mavjudlar |
| POST | `/webhooks/centrifugo/connect` | Centrifugo event |
| POST | `/webhooks/centrifugo/disconnect` | Centrifugo event |

Centrifugo `presence` namespace + qo'shimcha logic:
- Operator status o'zgarsa → Redis ZSET `operator:available` yangilanadi (zadd/zrem)
- RabbitMQ `operator.status.changed` event
- "Last seen" Redis'da: `presence:user:<id>` → ISO timestamp

**Transfer targets endpoint logikasi:**
```typescript
async getTransferTargets(requestingOperatorId: string, customerLocale: 'uz' | 'ru') {
  // Operatorlar: online, bo'sh, mijoz tilini biladi
  const operators = await this.db.operatorStates.findMany({
    where: {
      user_id: { not: requestingOperatorId },
      status: 'available',
      on_call: false,
      languages: { has: customerLocale },
    },
    include: { user: true },
    orderBy: { active_chats: 'asc' },
  });

  // Supervisorlar (bo'sh bo'lmasa ham ko'rsatish — eskalatsiya uchun)
  const supervisors = await this.db.operatorStates.findMany({
    where: {
      user_id: { not: requestingOperatorId },
      is_supervisor: true,
      status: { in: ['available', 'busy'] },
      languages: { has: customerLocale },
    },
    include: { user: true },
  });

  return { operators, supervisors };
}
```

### 7.4. media-service (port 3004)

| Method | Path | Maqsad |
|---|---|---|
| POST | `/media/presign` | Pre-signed S3 URL |
| POST | `/media/confirm` | Upload confirm, DB write |
| GET | `/media/:id` | Download URL (TTL 1h) |
| GET | `/media/:id/thumbnail` | Thumbnail |
| POST | `/media/voice` | Voice message (multipart) |

**Upload flow:**

```
1. Client → POST /media/presign
   { "file_name": "photo.jpg", "mime_type": "image/jpeg", "size_bytes": 2048000 }
   Response: {
     "upload_id": "uuid",
     "presigned_url": "https://minio/...",
     "expires_in": 3600,
     "storage_key": "2026/05/26/uuid.jpg"
   }

2. Client → PUT <presigned_url> (binary, direct to MinIO)

3. Client → POST /media/confirm
   { "upload_id": "...", "checksum": "sha256:..." }
   Service:
     - HEAD MinIO object, verify size & checksum
     - INSERT attachments
     - Async job: thumbnail generation (sharp/ffmpeg)
     - Async job: virus scan (ClamAV, production)
   Response: { "attachment_id": "..." }

4. Client → POST /rooms/:id/messages with attachment_id
```

**MIME whitelist:**
- Images: jpg, png, webp, gif, heic
- Video: mp4, mov, webm (max 100MB, 5 min)
- Audio: mp3, m4a, ogg, opus (voice messages)
- Docs: pdf, docx, xlsx, pptx, zip (max 50MB)

Mismatch → 400 reject.

### 7.5. call-service (port 3005) — ENG MUHIM

| Method | Path | Maqsad |
|---|---|---|
| POST | `/calls/initiate` | Mijoz qo'ng'iroq (inbound) |
| POST | `/calls/outbound` | Operator → mijoz |
| POST | `/calls/:id/answer` | Javob berish |
| POST | `/calls/:id/hangup` | Yotish |
| POST | `/calls/:id/hold` | Hold/unhold |
| POST | `/calls/:id/mute` | Mute |
| **POST** | **`/calls/:id/transfer`** | **Yo'naltirish (cold/warm)** |
| **POST** | **`/calls/:id/transfer/complete`** | **Warm transfer yakunlash** |
| **POST** | **`/calls/:id/transfer/cancel`** | **Warm transfer'dan voz kechish** |
| **POST** | **`/calls/:id/recording/start`** | **Recording boshlash** |
| **POST** | **`/calls/:id/recording/stop`** | **Recording to'xtatish** |
| POST | `/calls/:id/recording/consent-ack` | Client audio prompt tugagani haqida xabar |
| GET | `/calls/:id` | Detal |
| GET | `/calls` | History |
| POST | `/livekit/token` | LiveKit join token |
| POST | `/livekit/webhook` | LiveKit events |

#### Inbound call flow (mijoz → operator)

```
1. Mijoz → POST /calls/initiate { type: 'audio' }

2. call-service:
   a. INSERT calls (status='initiating', direction='inbound', caller_id=<mijoz>)
   b. Bo'sh operator izlash (ACD algorithm, pastda)
   c. AGAR topilsa:
      - LiveKit room yaratish: name = `call-${callId}`
      - Mijoz JWT (identity=customer_id, canPublish, canSubscribe)
      - Operator JWT (identity=operator_id, canPublish, canSubscribe)
      - calls.status='ringing', callee_id=<operator>, livekit_room
      - operator_states: status='busy', on_call=true, current_call_id
      - Centrifugo publish `chat:user#<operator>`:
        {
          type: 'incoming_call',
          call_id,
          livekit_url,
          token,
          caller: { id, name, avatar_url }
        }
      - Notification-service'ga RabbitMQ event (VoIP push backup)
      - Response to mijoz: { call_id, livekit_url, token }
      - Mijoz LiveKit'ga ulanadi, "ringback" tone client-side

   d. AGAR topilmasa:
      - INSERT call_queue (priority=0, required_language=mijoz.locale)
      - calls.status='queued'
      - Mijoz LiveKit'ga ulanadi (operator hali yo'q)
      - Centrifugo publish chat:user#<customer>:
        { type: 'play_audio', url: HOLD_MUSIC_URL, loop: true }
      - System message 'call.queued' room'ga
      - Background job har 15s queue ni ko'rib chiqadi

3. Operator browser'i Centrifugo orqali notification → Vue ringtone widget
   Operator "Accept" → POST /calls/:id/answer
   - LiveKit join (Vue tomonida), audio publish
   - calls.status='connected', answered_at=NOW(), ring_duration_ms
   - System message: 'operator.joined' { name: 'Aziza' }

4. Operator yoki mijoz hangup → POST /calls/:id/hangup
   - LiveKit room destroy (yoki participantni o'chirish)
   - Agar recording active bo'lsa → recording-service stop (avtomatik)
   - calls.status='completed', ended_at, talk_duration_ms, hangup_by
   - operator_states: status='available', on_call=false, current_call_id=null
   - RabbitMQ event call.ended
   - Queue poll: keyingi mijozni operator'ga biriktirish
```

#### Outbound call flow (operator → mijoz)

```
POST /calls/outbound { to_customer_id }

1. Mijoz online bormi?  - presence service tekshiradi
2. INSERT calls (status='initiating', direction='outbound', caller_id=operator, callee_id=customer)
3. LiveKit room yaratish, ikkalasi uchun token
4. VoIP push mijozga (CallKit ringtone — background'da ham)
   FCM data-only fallback (Android)
5. Mijoz "Accept" → POST /calls/:id/answer
6. Qolgan flow inbound bilan bir xil
```

#### Cold transfer flow

```
POST /calls/:id/transfer { to_operator_id, type: 'cold' }

1. Validation:
   - From_operator = joriy callee
   - To_operator status='available', on_call=false
   - To_operator mijoz tilini biladi

2. INSERT call_transfers (status='initiated', type='cold', from_operator, to_operator)
3. calls.status='transferring'
4. System message: 'transfer.started' to room (uz+ru)
5. To_operator'ga Centrifugo notification (incoming_call kabi):
   { type: 'transfer_request', call_id, from_operator, customer, livekit_url, token }

6. To_operator "Accept" → POST /calls/:id/transfer/complete
   - LiveKit removeParticipant(room, from_operator_identity)
   - To_operator yangi token bilan ulanadi (yangi participant join qiladi)
   - calls.operator_id (room.operator_id) = to_operator_id
   - calls.callee_id = to_operator_id
   - call_transfers.status='completed', completed_at=NOW()
   - System message: 'transfer.completed' { name: <to_operator.full_name> }
   - From_operator: status='available', on_call=false
   - To_operator: status='busy', on_call=true

7. To_operator "Reject":
   - calls.status='connected' (asl operator'ga qaytadi)
   - call_transfers.status='failed'
   - System message qaytarmaslik (operator A'ga yopiq notification)
```

#### Warm transfer flow

```
POST /calls/:id/transfer { to_operator_id, type: 'warm' }

1. Validation (cold bilan bir xil)
2. INSERT call_transfers (status='initiated', type='warm', ...)
3. Mijozni hold'ga:
   - From_operator audio track: mute (LiveKit mutePublishedTrack API)
     YOKI from_operator participantni vaqtincha disable
   - Mijozga 'play_audio' (hold_music, loop=true)
   - calls.status='on_hold'
4. Yangi LiveKit room: `consult-${callId}`
   - From_operator yangi token (consult room uchun)
   - To_operator yangi token (consult room uchun)
   - call_transfers.consult_room
5. Ikkala operator consult room'da gaplashadi.
6. From_operator'da 2 ta tugma: "Complete" yoki "Cancel"

   a) Complete → POST /calls/:id/transfer/complete
      - Consult room destroy
      - From_operator asosiy room'dan disconnect
      - To_operator asosiy room'ga yangi token bilan ulanadi
      - Mijozning hold tugaydi (audio mute off, hold_music to'xtatish)
      - calls.operator_id = to_operator_id, calls.callee_id, status='connected'
      - call_transfers.status='completed'
      - System message 'transfer.completed' { name }
      - From_operator status='available'
      - To_operator status='busy'

   b) Cancel → POST /calls/:id/transfer/cancel
      - Consult room destroy
      - To_operator status='available' (qaytariladi)
      - Mijoz hold'dan chiqadi, from_operator audio qaytariladi
      - calls.status='connected'
      - call_transfers.status='canceled'
```

#### Recording flow (operator-controlled, HUQUQIY)

**Bu eng muhim flow — har qadam aniq bo'lishi shart.**

```
POST /calls/:id/recording/start (faqat operator)

1. Validation:
   - call.status IN ('connected', 'on_hold')
   - Requesting user = call.callee_id (joriy operator)
   - Active recording allaqachon bormi? bo'lsa 409 Conflict
2. INSERT recordings (
     call_id, started_by=operator_id,
     status='starting',
     consent_announced=false
   )
3. Mijoz va operator locale'iga ko'ra audio prompt URL'ni tanlash:
   - Mijoz uz → RECORDING_ANNOUNCEMENT_URL_UZ
   - Mijoz ru → RECORDING_ANNOUNCEMENT_URL_RU
4. Centrifugo publish:
   chat:user#<customer> → { type: 'play_audio', url: <prompt>, blocking: true, recording_id }
   chat:user#<operator> → bir xil
5. Client (Flutter/Vue) audio chaladi (just_audio / HTML Audio)
   Tugagach client → POST /calls/:id/recording/consent-ack { recording_id }

6. consent-ack qabul qilingach:
   - recordings.consent_announced=true
   - LiveKit Egress start:
     egress.startRoomCompositeEgress(`call-${callId}`, {
       audioOnly: true,
       file: {
         filepath: `recordings/${year}/${month}/${callId}.mp3`,
         s3: { accessKey, secret, bucket: 'nova-recordings', endpoint: 'http://minio:9000', forcePathStyle: true }
       }
     })
   - recordings.status='active', egress_id
   - System message ikkala tomonga: 'call.recording.started'
   - Centrifugo broadcast: { type: 'recording_state', state: 'recording', call_id } — UI indikator uchun
   - RabbitMQ: call.recording.started
   - Audit log: kim qachon boshladi

7. Agar consent-ack 10 sek ichida kelmasa:
   - recordings.status='failed', failed_reason='consent_timeout'
   - Egress boshlanmaydi
   - Operator'ga notification

POST /calls/:id/recording/stop

1. Active recording'ni topish
2. LiveKit Egress stop (stopEgress(egress_id))
3. Webhook 'egress_ended' kutiladi (recording-service'ga)
4. recordings.status='completed', stopped_at, duration_ms, size_bytes, storage_key
5. calls.recording_id = recordings.id
6. System message: 'call.recording.stopped'
7. Centrifugo broadcast: { type: 'recording_state', state: 'stopped' }
8. Audit log

Avtomatik stop:
- Qo'ng'iroq hangup bo'lsa → recording avtomatik stop
- LiveKit room destroy bo'lsa ham
```

#### ACD operator selection algoritmi (til + skill bilan)

```typescript
async function findAvailableOperator(opts: {
  customerLocale: 'uz' | 'ru';
  requiredSkills?: string[];
  excludeOperatorIds?: string[];
}): Promise<User | null> {
  // Redis ZSET: 'operator:available'
  // score = active_chats (kam = oldinroq)
  const candidates = await redis.zrange('operator:available', 0, 50);

  for (const operatorId of candidates) {
    if (opts.excludeOperatorIds?.includes(operatorId)) continue;

    const state = await db.operatorStates.findFirst({
      where: { user_id: operatorId },
      include: { user: true },
    });
    if (!state || state.status !== 'available' || state.on_call) continue;
    if (state.active_chats >= state.max_concurrent_chats) continue;

    // Til mos kelishi
    if (!state.languages.includes(opts.customerLocale)) continue;

    // Skill mos kelishi
    if (opts.requiredSkills?.length) {
      const hasAll = opts.requiredSkills.every(s => state.skills.includes(s));
      if (!hasAll) continue;
    }

    // Atomic claim (5 sek lock — boshqa request bir vaqtda urinmasin)
    const locked = await redis.set(
      `operator:claim:${operatorId}`, '1', 'NX', 'EX', 5
    );
    if (locked === 'OK') return state.user;
  }
  return null;
}
```

### 7.6. notification-service (port 3006)

**RabbitMQ consumer.** Subscribe queue: `notification.push`.

**Event handler'lar:**
- `message.created` → agar oluvchi offline yoki app background → push (locale'iga ko'ra)
- `call.initiated` (target=operator) → VoIP push (iOS), high-priority FCM (Android)
- `call.ended` (status='no_answer' va missed) → "Missed call" push

**FCM payload (yangi xabar, uz user):**
```json
{
  "to": "<device_token>",
  "priority": "high",
  "notification": {
    "title": "Ali Valiyev",
    "body": "Salom, qanday yordam beraman?",
    "sound": "default",
    "badge": 1
  },
  "data": {
    "type": "chat_message",
    "room_id": "uuid",
    "message_id": "uuid",
    "sender_id": "uuid"
  },
  "android": { "channel_id": "chat_messages", "ttl": "86400s" }
}
```

**VoIP push (iOS CallKit):**
```json
{
  "aps": { "content-available": 1 },
  "type": "incoming_call",
  "call_id": "uuid",
  "caller_name": "Operator Aziza",
  "livekit_url": "wss://...",
  "livekit_token": "..."
}
```

**i18n templates (`locales/uz.json`, `ru.json`):**
- `notification.new_message.title` = "Yangi xabar" / "Новое сообщение"
- `notification.missed_call.title` = "Javobsiz qo'ng'iroq" / "Пропущенный звонок"
- `notification.incoming_call.title` = "Kiruvchi qo'ng'iroq" / "Входящий звонок"

Oluvchi `users.locale` field bo'yicha til tanlanadi.

### 7.7. recording-service (port 3007)

| Method | Path | Maqsad |
|---|---|---|
| POST | `/recordings/start` | Egress boshlash (call-service'dan keladi) |
| POST | `/recordings/stop` | Egress to'xtatish |
| POST | `/webhooks/livekit/egress` | LiveKit egress webhook |
| GET | `/recordings/:id` | Metadata + signed URL (admin only) |
| GET | `/recordings/by-call/:callId` | Bitta call uchun |

**LiveKit Egress webhook handler:**
- `egress_started` → `recordings.status='active'`
- `egress_ended` → `recordings.status='completed'` + duration, size, key, file presigned URL
- `egress_failed` → `recordings.status='failed'` + reason
- RabbitMQ event `call.recording.completed` (audit, KPI uchun)

**Saqlash:**
- Bucket: `nova-recordings`
- Key format: `recordings/{YYYY}/{MM}/{call_id}.mp3`
- Retention: 90 kun (MinIO lifecycle policy)
- Access: faqat **admin, supervisor va shu qo'ng'iroq operatori** (signed URL TTL 1 soat)

**Access kontrol misoli:**
```typescript
async getRecordingUrl(recordingId: string, requestingUser: User): Promise<string> {
  const rec = await db.recordings.findUnique({ where: { id: recordingId }, include: { call: true } });
  if (!rec) throw new NotFoundException();

  const allowed = requestingUser.role === 'admin'
    || requestingUser.role === 'supervisor'
    || rec.started_by === requestingUser.id
    || rec.call.callee_id === requestingUser.id;
  if (!allowed) throw new ForbiddenException();

  // Audit
  await this.audit.log('recording.accessed', requestingUser.id, 'recording', recordingId);

  return minio.presignedGetObject('nova-recordings', rec.storage_key, 3600);
}
```

### 7.8. bot-gateway (port 3008) — PHASE 10 (hozir STUB)

Hozir konteyner yaratilmaydi, lekin **schema va RabbitMQ queue tayyor.**

**Phase 10'da implementatsiya:**
- `bot.inbox` queue'dan `message.created` ushlaydi (faqat `room.status='bot_handling'`)
- Bot turi (`bot_configs.type`):
  - **'faq'** — intent matching, JSON config
  - **'ai'** — Anthropic Claude / OpenAI API
  - **'hybrid'** — avval FAQ, ishonchli javob yo'q bo'lsa AI'ga
- Handoff trigger:
  - Mijoz `handoff_keywords`'dan biri yozsa
  - Bot confidence past
  - Bot 3+ marta tushunmasa
- Handoff → `room.status='open'`, ACD ishga tushadi, system message 'bot.handoff'

**API (kelajakda):**
| Method | Path | Maqsad |
|---|---|---|
| POST | `/bot/configs` | Bot yaratish/yangilash |
| GET | `/bot/configs` | Ro'yxat |
| POST | `/bot/test` | Test xabar yuborish |
| POST | `/bot/handoff/:roomId` | Operator'ga eskalatsiya |

**Schema oldindan tayyor** (`bot_configs` jadvali, `users.role='bot'`, `message.type='bot_card'|'bot_quick_reply'`). Hozir hech narsa qilmaysiz, lekin arxitektura teshik qoldiradi.

---

## 8. LiveKit konfiguratsiyasi va Egress

### 8.1. Server SDK (Node.js)

```typescript
import { RoomServiceClient, AccessToken, EgressClient } from 'livekit-server-sdk';

const livekit = new RoomServiceClient(
  process.env.LIVEKIT_HOST!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_SECRET!,
);
const egress = new EgressClient(
  process.env.LIVEKIT_HOST!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_SECRET!,
);

// Room yaratish
await livekit.createRoom({
  name: `call-${callId}`,
  emptyTimeout: 60,
  maxParticipants: 10,
});

// Token yaratish
const token = new AccessToken(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_SECRET!,
  { identity: customerId, name: customerName, ttl: '1h' }
);
token.addGrant({
  room: `call-${callId}`,
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
});
const jwt = await token.toJwt();

// Recording start
const egressInfo = await egress.startRoomCompositeEgress(`call-${callId}`, {
  audioOnly: true,
  file: {
    filepath: `recordings/${year}/${month}/${callId}.mp3`,
    s3: {
      accessKey: process.env.MINIO_ACCESS_KEY!,
      secret: process.env.MINIO_SECRET_KEY!,
      bucket: 'nova-recordings',
      endpoint: 'http://minio:9000',
      forcePathStyle: true,
    },
  },
});

// Transfer: participant remove
await livekit.removeParticipant(`call-${callId}`, operatorId);

// Mute (warm transfer hold uchun)
await livekit.mutePublishedTrack(`call-${callId}`, operatorIdentity, trackSid, true);
```

### 8.2. Hold music va recording prompt — CLIENT-SIDE

LiveKit'da audio fayl ijro etish 2 yo'l: client-side va server-side (Ingress). **Tavsiya: client-side** — soddaroq, kichik latency:

```typescript
// call-service → Centrifugo
await centrifugo.publish(`chat:user#${customerId}`, {
  type: 'play_audio',
  url: process.env.RECORDING_ANNOUNCEMENT_URL_UZ,
  blocking: true,        // tugagunicha boshqa narsa qilmasin
  loop: false,
  audio_id: 'recording_prompt',  // tugagach client ack uchun
});
```

**Flutter:**
```dart
centrifuge.publication.listen((event) async {
  final data = jsonDecode(event.data);
  if (data['type'] == 'play_audio') {
    final player = AudioPlayer();
    await player.setUrl(data['url']);
    await player.play();
    if (data['blocking'] == true) {
      await player.playerStateStream.firstWhere((s) => s.processingState == ProcessingState.completed);
      // Server'ga ack yuborish
      await api.post('/calls/$callId/recording/consent-ack', {
        'recording_id': data['recording_id'],
      });
    }
  }
});
```

### 8.3. LiveKit webhook
`/livekit/webhook` (call-service yoki recording-service). Event'lar:
- `room_started`, `room_finished`
- `participant_joined`, `participant_left`
- `track_published`, `track_unpublished`
- `egress_started`, `egress_ended`, `egress_updated`

Asoslanib `calls` va `recordings` jadvallar yangilanadi.

### 8.4. Tizim audio fayllarni yuklash

```bash
# scripts/upload-system-audio.sh
#!/bin/bash
set -e
mc alias set local http://localhost:9000 minioadmin minioadmin123
mc cp ./assets/audio/recording_uz.mp3 local/nova-media/sys/recording_uz.mp3
mc cp ./assets/audio/recording_ru.mp3 local/nova-media/sys/recording_ru.mp3
mc cp ./assets/audio/hold_music.mp3 local/nova-media/sys/hold_music.mp3
echo "✓ System audio uploaded"
```

**Audio fayllar mazmuni:**
- `recording_uz.mp3` — "Diqqat! Bu qo'ng'iroq sifat nazorati uchun yozilmoqda." (~3s, ovoz studio sifatida)
- `recording_ru.mp3` — "Внимание! Этот звонок записывается в целях контроля качества." (~3s)
- `hold_music.mp3` — instrumental, loop-friendly, ~30-60s

---

## 9. Nova (Laravel) integratsiyasi

### 9.1. Yondashuv
Nova kodini **minimum o'zgartirish**. Yangi `NovaChatPanel` Vue tool yaratiladi.

### 9.2. Composer + npm
```bash
composer require firebase/php-jwt
composer require guzzlehttp/guzzle
cd nova-components/ChatPanel
npm install --save centrifuge livekit-client
```

### 9.3. Config (`config/nova-chat.php`)
```php
return [
    'chat_api_url'      => env('CHAT_API_URL', 'http://localhost:3002'),
    'auth_api_url'      => env('AUTH_API_URL', 'http://localhost:3001'),
    'call_api_url'      => env('CALL_API_URL', 'http://localhost:3005'),
    'presence_api_url'  => env('PRESENCE_API_URL', 'http://localhost:3003'),
    'centrifugo_url'    => env('CENTRIFUGO_WS', 'ws://localhost:8000/connection/websocket'),
    'livekit_url'       => env('LIVEKIT_URL', 'ws://localhost:7880'),
    'nova_shared_secret'=> env('NOVA_SHARED_SECRET'),
    'default_locale'    => 'uz',
];
```

### 9.4. SSO controller (`app/Http/Controllers/NovaChatSsoController.php`)
```php
class NovaChatSsoController extends Controller {
    public function token(Request $request) {
        $user = auth()->user();
        $payload = [
            'nova_user_id' => $user->id,
            'email' => $user->email,
            'full_name' => $user->name,
            'role' => $user->isAdmin() ? 'admin'
                    : ($user->isSupervisor() ? 'supervisor' : 'operator'),
            'locale' => $user->locale ?? 'uz',
            'ts' => time(),
        ];
        $signature = hash_hmac('sha256', json_encode($payload), config('nova-chat.nova_shared_secret'));

        $response = Http::withHeaders(['X-Nova-Signature' => $signature])
            ->post(config('nova-chat.auth_api_url') . '/auth/nova/sso', $payload);

        if (!$response->successful()) {
            return response()->json(['error' => 'SSO failed'], 500);
        }

        return $response->json();
    }
}
```

Route (`routes/web.php`):
```php
Route::middleware(['nova', 'auth'])->group(function () {
    Route::post('/nova-vendor/chat-panel/sso', [NovaChatSsoController::class, 'token']);
});
```

### 9.5. Vue Nova Tool

`nova-components/ChatPanel/resources/js/components/Tool.vue`:

```vue
<template>
  <div class="nova-chat" :class="`locale-${locale}`">
    <aside class="rooms-list">
      <RoomItem
        v-for="room in rooms" :key="room.id"
        :room="room" :locale="locale"
        @click="openRoom(room)"
      />
    </aside>
    <main class="chat-window" v-if="activeRoom">
      <MessageList :messages="messages" :locale="locale" />
      <MessageInput @send="sendMessage" :placeholder="t('chat.type_message')" />
    </main>
    <IncomingCallModal
      v-if="incomingCall"
      :call="incomingCall" :locale="locale"
      @accept="acceptCall" @reject="rejectCall"
    />
    <InCallPanel
      v-if="activeCall"
      :call="activeCall" :locale="locale" :is-recording="isRecording"
      @hangup="hangup"
      @transfer="openTransferDialog"
      @toggle-recording="toggleRecording"
      @toggle-mute="toggleMute"
      @toggle-hold="toggleHold"
    />
    <TransferDialog
      v-if="transferDialogOpen"
      :targets="transferTargets" :locale="locale"
      @select="performTransfer" @cancel="transferDialogOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { Centrifuge } from 'centrifuge';
import { Room } from 'livekit-client';
import { useI18n } from './composables/useI18n';

const { t, locale } = useI18n();
const centrifuge = ref(null);
const accessToken = ref(null);
const rooms = ref([]);
const messages = ref([]);
const activeRoom = ref(null);
const incomingCall = ref(null);
const activeCall = ref(null);
const livekitRoom = ref(null);
const transferDialogOpen = ref(false);
const transferTargets = ref([]);
const isRecording = ref(false);

onMounted(async () => {
  const sso = await Nova.request().post('/nova-vendor/chat-panel/sso');
  locale.value = sso.locale;
  accessToken.value = sso.access_token;

  centrifuge.value = new Centrifuge(Nova.config('chat_centrifugo_url'), {
    token: sso.centrifugo_token,
  });
  centrifuge.value.connect();

  const userSub = centrifuge.value.newSubscription(`chat:user#${sso.user_id}`);
  userSub.on('publication', ({ data }) => {
    if (data.type === 'incoming_call' || data.type === 'transfer_request') {
      incomingCall.value = data;
      playRingtone();
    }
    if (data.type === 'play_audio') playSystemAudio(data);
    if (data.type === 'recording_state') isRecording.value = data.state === 'recording';
    if (data.type === 'new_room_assigned') refreshRooms();
  });
  userSub.subscribe();

  rooms.value = await fetchRooms();
});

async function acceptCall(call) {
  livekitRoom.value = new Room();
  await livekitRoom.value.connect(Nova.config('livekit_url'), call.token);
  await livekitRoom.value.localParticipant.setMicrophoneEnabled(true);
  activeCall.value = call;
  incomingCall.value = null;
  stopRingtone();
  await api.post(`/calls/${call.call_id}/answer`);
}

async function openTransferDialog() {
  const res = await api.get(`/operator/transfer-targets?locale=${activeCall.value.customer.locale}`);
  transferTargets.value = res.data;
  transferDialogOpen.value = true;
}

async function performTransfer({ operatorId, type }) {
  await api.post(`/calls/${activeCall.value.call_id}/transfer`, {
    to_operator_id: operatorId, type,
  });
  transferDialogOpen.value = false;
}

async function toggleRecording() {
  const action = isRecording.value ? 'stop' : 'start';
  await api.post(`/calls/${activeCall.value.call_id}/recording/${action}`);
  // isRecording updated via Centrifugo 'recording_state' event
}

async function hangup() {
  await api.post(`/calls/${activeCall.value.call_id}/hangup`);
  livekitRoom.value?.disconnect();
  activeCall.value = null;
}

async function playSystemAudio(data) {
  const audio = new Audio(data.url);
  audio.loop = data.loop ?? false;
  await audio.play();
  if (data.blocking) {
    await new Promise(resolve => audio.addEventListener('ended', resolve, { once: true }));
    await api.post(`/calls/${activeCall.value.call_id}/recording/consent-ack`, {
      recording_id: data.recording_id,
    });
  }
}

// api helper: axios with Authorization: Bearer accessToken.value
</script>
```

### 9.6. i18n (uz + ru) — Vue tomonida

`resources/js/locales/uz.json`:
```json
{
  "chat": {
    "type_message": "Xabar yozing...",
    "rooms": "Suhbatlar",
    "no_rooms": "Suhbat yo'q",
    "search": "Qidirish"
  },
  "call": {
    "incoming": "Kiruvchi qo'ng'iroq",
    "accept": "Javob berish",
    "reject": "Rad etish",
    "hangup": "Tugatish",
    "mute": "Mikrofonni o'chirish",
    "hold": "Kutdirish",
    "transfer": "Yo'naltirish",
    "record_start": "Yozishni boshlash",
    "record_stop": "Yozishni to'xtatish",
    "recording_active": "Yozilmoqda"
  },
  "transfer": {
    "cold": "To'g'ridan-to'g'ri yo'naltirish",
    "warm": "Avval gaplashib, keyin yo'naltirish",
    "select_operator": "Operatorni tanlang",
    "available_operators": "Bo'sh operatorlar",
    "supervisors": "Supervisorlar"
  }
}
```

`resources/js/locales/ru.json`:
```json
{
  "chat": {
    "type_message": "Напишите сообщение...",
    "rooms": "Чаты",
    "no_rooms": "Нет чатов",
    "search": "Поиск"
  },
  "call": {
    "incoming": "Входящий звонок",
    "accept": "Ответить",
    "reject": "Отклонить",
    "hangup": "Завершить",
    "mute": "Выключить микрофон",
    "hold": "Удержание",
    "transfer": "Перевести",
    "record_start": "Начать запись",
    "record_stop": "Остановить запись",
    "recording_active": "Идёт запись"
  },
  "transfer": {
    "cold": "Прямой перевод",
    "warm": "Сначала консультация, потом перевод",
    "select_operator": "Выберите оператора",
    "available_operators": "Свободные операторы",
    "supervisors": "Супервайзеры"
  }
}
```

`composables/useI18n.js`:
```javascript
import { ref, computed } from 'vue';
import uz from '../locales/uz.json';
import ru from '../locales/ru.json';

const locales = { uz, ru };
const locale = ref('uz');

export function useI18n() {
  const t = (key) => {
    const parts = key.split('.');
    let result = locales[locale.value];
    for (const part of parts) result = result?.[part];
    return result ?? key;
  };
  return { t, locale };
}
```

---

## 10. Flutter mobile app (Mijoz uchun)

### 10.1. Package'lar (`pubspec.yaml`)

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  intl: ^0.19.0
  dio: ^5.4.0
  centrifuge: ^0.18.0
  livekit_client: ^2.0.0
  flutter_callkit_incoming: ^2.5.0
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^17.0.0
  hive: ^2.2.0
  hive_flutter: ^1.1.0
  flutter_secure_storage: ^9.0.0
  file_picker: ^8.0.0
  image_picker: ^1.0.0
  permission_handler: ^11.0.0
  cached_network_image: ^3.3.0
  flutter_riverpod: ^2.5.0
  freezed_annotation: ^2.4.0
  json_annotation: ^4.8.0
  dio_smart_retry: ^6.0.0
  just_audio: ^0.9.0
  flutter_sound: ^9.0.0
```

### 10.2. Folder struktura

```
mobile/
├── lib/
│   ├── main.dart
│   ├── core/
│   │   ├── api/         (Dio interceptors, retry, refresh token)
│   │   ├── storage/     (Hive, secure storage)
│   │   ├── push/        (FCM init, handlers)
│   │   ├── i18n/        (generated from .arb)
│   │   └── theme/
│   ├── features/
│   │   ├── auth/        (login, OTP, locale picker)
│   │   ├── chat/        (rooms, messages, file picker)
│   │   ├── call/        (incoming, outgoing, in-call UI)
│   │   └── profile/
│   └── shared/
│       ├── models/      (freezed DTOs)
│       └── widgets/
├── l10n/
│   ├── app_uz.arb
│   └── app_ru.arb
├── android/
│   └── app/src/main/AndroidManifest.xml
└── ios/
    └── Runner/Info.plist
```

### 10.3. i18n setup

`l10n/app_uz.arb`:
```json
{
  "@@locale": "uz",
  "chatTypeMessage": "Xabar yozing...",
  "callIncoming": "Kiruvchi qo'ng'iroq",
  "callAccept": "Javob berish",
  "callReject": "Rad etish",
  "callHangup": "Tugatish",
  "callRecordingNotice": "Bu qo'ng'iroq yozilmoqda",
  "noOperatorAvailable": "Hozircha bo'sh operator yo'q. Iltimos, keyinroq qayta urinib ko'ring",
  "searchingOperator": "Operator topilmoqda...",
  "selectLanguage": "Tilni tanlang"
}
```

`l10n/app_ru.arb`:
```json
{
  "@@locale": "ru",
  "chatTypeMessage": "Напишите сообщение...",
  "callIncoming": "Входящий звонок",
  "callAccept": "Ответить",
  "callReject": "Отклонить",
  "callHangup": "Завершить",
  "callRecordingNotice": "Этот звонок записывается",
  "noOperatorAvailable": "Сейчас нет свободных операторов. Попробуйте позже",
  "searchingOperator": "Поиск оператора...",
  "selectLanguage": "Выберите язык"
}
```

`pubspec.yaml`:
```yaml
flutter:
  generate: true
```

`l10n.yaml`:
```yaml
arb-dir: l10n
template-arb-file: app_uz.arb
output-localization-file: app_localizations.dart
```

`main.dart`:
```dart
MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: const [Locale('uz'), Locale('ru')],
  locale: ref.watch(userLocaleProvider),
  ...
)
```

### 10.4. Chat connection (Riverpod provider)

```dart
final centrifugeProvider = Provider<Client>((ref) {
  final token = ref.watch(centrifugoTokenProvider);
  final client = Client(
    'wss://api.nova.local/connection/websocket',
    ClientConfig(token: token),
  );
  client.connect();
  return client;
});

final roomMessagesProvider = StreamProvider.family<List<Message>, String>((ref, roomId) async* {
  final client = ref.watch(centrifugeProvider);
  final sub = client.newSubscription('chat:room#$roomId');
  await sub.subscribe();

  final messages = <Message>[];
  final controller = StreamController<List<Message>>();

  sub.publication.listen((event) {
    final msg = Message.fromJson(jsonDecode(event.data));
    messages.add(msg);
    controller.add(List.from(messages));
  });

  yield* controller.stream;
});
```

### 10.5. Incoming call (CallKit + LiveKit)

```dart
// FCM background handler — VoIP push (iOS) yoki high-priority FCM (Android)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (message.data['type'] == 'incoming_call') {
    await FlutterCallkitIncoming.showCallkitIncoming(
      CallKitParams(
        id: message.data['call_id'],
        nameCaller: message.data['caller_name'],
        type: 0,  // audio
        extra: {
          'livekit_url': message.data['livekit_url'],
          'token': message.data['livekit_token'],
          'call_id': message.data['call_id'],
        },
      ),
    );
  }
}

// Accept handler
FlutterCallkitIncoming.onEvent.listen((event) async {
  if (event!.event == Event.actionCallAccept) {
    final extra = event.body['extra'];
    final room = Room();
    await room.connect(extra['livekit_url'], extra['token']);
    await room.localParticipant!.setMicrophoneEnabled(true);

    // System audio event listener (recording prompt, hold music)
    final centrifuge = ref.read(centrifugeProvider);
    final callChannel = centrifuge.newSubscription('chat:user#${currentUserId}');
    callChannel.publication.listen((event) async {
      final data = jsonDecode(event.data);
      if (data['type'] == 'play_audio') {
        final player = AudioPlayer();
        await player.setUrl(data['url']);
        if (data['loop'] == true) await player.setLoopMode(LoopMode.one);
        await player.play();
        if (data['blocking'] == true) {
          await player.playerStateStream.firstWhere(
            (s) => s.processingState == ProcessingState.completed,
          );
          await api.post('/calls/${extra['call_id']}/recording/consent-ack', data: {
            'recording_id': data['recording_id'],
          });
        }
      }
      if (data['type'] == 'recording_state') {
        // UI banner — "🔴 Yozilmoqda" / "🔴 Идёт запись"
        ref.read(callRecordingStateProvider.notifier).state = data['state'] == 'recording';
      }
    });
    await callChannel.subscribe();

    Navigator.push(
      navigatorKey.currentContext!,
      MaterialPageRoute(builder: (_) => InCallScreen(room: room, callId: extra['call_id'])),
    );
  }

  if (event.event == Event.actionCallDecline) {
    await api.post('/calls/${event.body['id']}/hangup');
  }
});
```

### 10.6. Recording notice UI

Mijoz qo'ng'iroq paytida operator recording yoqsa:
1. Audio prompt avtomatik chaladi (`play_audio` event)
2. UI'da banner: "🔴 Qo'ng'iroq yozilmoqda" / "🔴 Звонок записывается"
3. System message chat'ga ham qo'shiladi

```dart
// InCallScreen
Widget build(BuildContext context) {
  final isRecording = ref.watch(callRecordingStateProvider);
  final l10n = AppLocalizations.of(context)!;

  return Scaffold(
    body: Stack(
      children: [
        // ... call UI
        if (isRecording)
          Positioned(
            top: 50, left: 16, right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.9),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.fiber_manual_record, color: Colors.white, size: 12),
                  const SizedBox(width: 8),
                  Text(l10n.callRecordingNotice, style: const TextStyle(color: Colors.white)),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}
```

### 10.7. AndroidManifest.xml asosiy permissions

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.READ_PHONE_NUMBERS"/>
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS"/>
```

### 10.8. iOS Info.plist asosiy keys

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Qo'ng'iroqlar uchun mikrofon kerak / Микрофон необходим для звонков</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
  <string>remote-notification</string>
</array>
```

---

## 11. i18n strategiya (umumiy)

| Qatlam | Texnologiya | Faylllar |
|---|---|---|
| Backend (NestJS) | `nestjs-i18n` | `services/*/locales/uz.json`, `ru.json` |
| System messages (DB) | PostgreSQL jadval `system_message_templates` | uz + ru ustunlari |
| Nova/Vue | Custom composable `useI18n` | `resources/js/locales/{uz,ru}.json` |
| Flutter | `flutter_localizations` + ARB | `l10n/app_{uz,ru}.arb` |
| Push notifications | Backend tomonidan oluvchi locale'iga ko'ra | notification-service ichida |

**Default:** o'zbek (lotin). Foydalanuvchi profilda o'zgartiradi (`PATCH /auth/me/locale`).

**Server xabarlari format (system message):**
```json
{
  "type": "system",
  "content": "{\"uz\": \"Operator Ali qoshildi\", \"ru\": \"Оператор Ali присоединился\"}"
}
```

Client `JSON.parse(content)[userLocale]` qiladi.

**Yangi til qo'shish (kelajak):**
1. `user_locale` enum'ga qo'shish (migration)
2. `system_message_templates`'ga ustun yoki jadvalni qayta dizayn qilish
3. Backend/Vue/Flutter locale fayllar
4. Mobile app `supportedLocales`

---

## 12. Xavfsizlik

### 12.1. Transport
- **Lokal:** HTTP + WS (self-signed TLS optional, Traefik + mkcert)
- **Production:** HTTPS + WSS majburiy (Let's Encrypt)

### 12.2. Authentication
- JWT (HS256 lokal, **RS256 production**). Secret 32+ char.
- Refresh token rotation, theft detection (eski token ishlatilsa → barcha sessiyalar o'chiriladi).
- Rate limit: `/auth/otp/send` — 1/daqiqa per phone, 5/kun.

### 12.3. Authorization
Har bir endpoint guard:
```typescript
@UseGuards(JwtAuthGuard, RoomMemberGuard)
@Post('rooms/:id/messages')
async sendMessage(...) {}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('operator', 'supervisor')
@Post('calls/:id/transfer')
async transfer(...) {}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'supervisor')
@Get('recordings/:id')
async getRecording(...) {}
```

### 12.4. Recording huquqiy talab (KRITIK!)

**O'zbekiston qonunchiligiga muvofiq, mijozni ogohlantirmasdan yozish — jinoyat.**

Kod-level enforcement:
```typescript
async startEgress(recordingId: string) {
  const rec = await db.recordings.findUnique({ where: { id: recordingId } });
  if (!rec.consent_announced) {
    throw new BadRequestException('Audio consent must be played before egress start');
  }
  // ... LiveKit egress start
}
```

Qoidalar:
- `consent_announced` flag faqat client `consent-ack` POST qilgandan keyin `true` bo'ladi
- Mijoz UI'da har doim "🔴 Recording" indikator bo'lishi shart
- Recording fayllarga access: faqat **shu qo'ng'iroq operatori, supervisor, admin**
- Audit log: kim qachon recording'ga kirgan (timestamp, IP, user_agent)

### 12.5. E2EE (kelajakda)
Hozir TLS yetarli. Keyin Signal Protocol qo'shilsa, `messages.content` TEXT — ciphertext sig'adi.

### 12.6. Fayl xavfsizligi
- MIME whitelist enforcement
- ClamAV antivirus scan (production)
- Image EXIF stripping (geolocation leak prevention)
- Pre-signed URL TTL 1 soat
- MinIO bucket policy: `nova-recordings` public read **off**

### 12.7. SQL injection / XSS
- Prisma ORM — parametrized queries
- DTO validation `class-validator`
- Vue/Flutter avtomatik escape, `v-html` qat'iy man qilingan

### 12.8. CORS
```typescript
app.enableCors({
  origin: ['https://nova.local', 'https://app.nova.local'],
  credentials: true,
});
```

### 12.9. Audit
Barcha sezgir amallar → `audit_logs`:
- login/logout
- message delete/edit
- recording start/stop/access
- call transfer
- operator status change
- admin actions
- Nova SSO

### 12.10. Bot xavfsizligi (Phase 10 uchun)
- Bot'lar `users.role='bot'` — alohida JWT subject prefix `bot:`
- Bot AI provider API keys faqat `bot-gateway` ichida (secret)
- Mijoz bilan suhbatda bot output sanitize qilinadi (XSS, prompt injection)

---

## 13. Monitoring va observability

### 13.1. Metrics (Prometheus)
Har bir service `/metrics` endpoint (`prom-client` npm):
- `http_requests_total{method,route,status}`
- `http_request_duration_seconds{method,route}` (histogram)
- `chat_messages_sent_total{locale}`
- `chat_active_rooms`
- `calls_active`
- `calls_queue_length`
- `calls_queue_wait_seconds` (histogram)
- `calls_transferred_total{type}` — cold/warm
- `calls_recorded_total`
- `operator_available_count{language}`
- `centrifugo_clients_connected` (Centrifugo native)

### 13.2. Logs (Loki)
Structured JSON, har log'da:
```json
{
  "ts": "2026-05-26T10:00:00Z",
  "level": "info",
  "service": "call-service",
  "correlation_id": "uuid",
  "user_id": "uuid",
  "msg": "transfer completed",
  "call_id": "uuid",
  "transfer_type": "warm",
  "from_operator": "uuid",
  "to_operator": "uuid"
}
```

### 13.3. Tracing (OpenTelemetry)
Production'da Jaeger/Tempo. Hozir optional.

### 13.4. Alerting (Grafana)
- Operator queue > 10 mijoz → Slack alert
- Centrifugo client > 80% capacity
- DB connection pool > 80%
- Call failure rate > 5%
- Recording failure rate > 1%

### 13.5. KPI metric collection (v2 dashboard uchun)

Hozir alohida dashboard yo'q, lekin **ma'lumotlar yig'iladi.** Quyidagi SQL view'lar `init.sql`'ga qo'shing (kelajakda Grafana yoki Nova page'da ishlatish uchun):

```sql
CREATE OR REPLACE VIEW v_operator_kpi_daily AS
SELECT
  c.callee_id AS operator_id,
  DATE(c.initiated_at) AS day,
  COUNT(*) AS total_calls,
  AVG(c.talk_duration_ms) AS avg_talk_duration_ms,
  AVG(c.queue_wait_ms) AS avg_queue_wait_ms,
  COUNT(*) FILTER (WHERE c.status = 'completed') AS completed_calls,
  COUNT(*) FILTER (WHERE c.status = 'no_answer') AS missed_calls,
  (SELECT COUNT(*) FROM call_transfers t WHERE t.from_operator = c.callee_id
     AND DATE(t.initiated_at) = DATE(c.initiated_at)) AS transfers_made
FROM calls c
WHERE c.callee_id IS NOT NULL
GROUP BY c.callee_id, DATE(c.initiated_at);

CREATE OR REPLACE VIEW v_chat_first_response AS
SELECT
  m.room_id,
  EXTRACT(EPOCH FROM (
    MIN(m.created_at) FILTER (WHERE u.role IN ('operator','supervisor'))
    - MIN(m.created_at) FILTER (WHERE u.role = 'customer')
  )) * 1000 AS first_response_ms
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.type IN ('text', 'image', 'video', 'file')
GROUP BY m.room_id;
```

Phase 11'da KPI dashboard yasash uchun ma'lumotlar tayyor bo'ladi.

---

## 14. Testing strategiyasi

### 14.1. Unit tests
- Har bir service: Jest, coverage > 70%
- Kritik path'lar:
  - ACD algorithm (til + skill filter)
  - JWT verification
  - Transfer state machine
  - Recording consent flow
  - i18n template interpolation

### 14.2. Integration tests
- Testcontainers (PostgreSQL, Redis, RabbitMQ ephemeral)
- E2E flow'lar:
  1. Register → send message → receive → read
  2. Incoming call → answer → transfer (warm) → complete → hangup
  3. Call → start recording → consent verified → stop → file in MinIO
  4. Two operators: A starts warm transfer → cancels → returns to A

### 14.3. Load tests (k6)

`tests/load/chat-flood.js`:
```javascript
import ws from 'k6/ws';
export const options = { vus: 10000, duration: '5m' };
export default function () {
  const url = 'ws://localhost:8000/connection/websocket';
  ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({
        method: 'connect',
        params: { token: __ENV.TOKEN },
      }));
    });
    socket.setTimeout(() => socket.close(), 60000);
  });
}
```

`tests/load/call-storm.js`:
```javascript
import http from 'k6/http';
export const options = { vus: 200, duration: '2m' };
export default function () {
  const res = http.post('http://localhost:3005/calls/initiate', JSON.stringify({
    type: 'audio',
  }), {
    headers: {
      'Authorization': `Bearer ${__ENV.TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  // expect 201 or 503 (queue full)
}
```

**Maqsadli ko'rsatkichlar (lokal MacBook M2 / desktop 32GB):**
- 10K concurrent WebSocket: CPU < 30%
- 1000 msg/sec throughput
- p95 message latency < 100ms (publish → receive)
- 100 parallel audio call: stable
- Recording consent flow < 5s end-to-end

### 14.4. Call quality testing
- LiveKit ichki metrics (jitter, packet loss, MOS estimation)
- MOS > 4.0
- Jitter < 30ms
- Packet loss < 1%

---

## 15. Deployment plan

### 15.1. Lokal (development)
```bash
git clone <repo>
cp .env.example .env
docker compose up -d
docker compose exec chat-service npm run migrate
docker compose exec chat-service npm run seed:dev
./scripts/upload-system-audio.sh
```

UI:
- Grafana: http://localhost:3000 (admin/admin)
- MinIO console: http://localhost:9001
- Centrifugo admin: http://localhost:8000
- RabbitMQ: http://localhost:15672
- Traefik dashboard: http://localhost:8080

### 15.2. Staging → Production (kelajakda)
- Kubernetes (k3s lokal, EKS/GKE production)
- Helm charts har bir service uchun
- PostgreSQL — managed (RDS Aurora yoki self-hosted Patroni)
- Redis — managed (ElastiCache yoki KeyDB cluster)
- Centrifugo — 3+ replica, sticky sessions
- LiveKit — 2+ node, regional clustering
- MinIO → S3 (AWS) yoki Wasabi
- CDN: CloudFront yoki BunnyCDN

### 15.3. Migration: lokal → server
1. `.env` o'zgartirish (URL'lar, secret'lar)
2. PostgreSQL backup → restore
3. MinIO bucket sync (`mc mirror`)
4. DNS
5. TLS sertifikatlari

**Kod o'zgarmaydi.**

---

## 16. Loyiha fayl strukturasi

```
nova-platform/
├── README.md
├── docker-compose.yml
├── .env.example
├── Makefile
├── infra/
│   ├── postgres/init.sql
│   ├── redis/redis.conf
│   ├── centrifugo/config.json
│   ├── livekit/livekit.yaml
│   ├── livekit/egress.yaml
│   ├── traefik/dynamic.yml
│   ├── prometheus/prometheus.yml
│   └── grafana/provisioning/
├── services/
│   ├── auth/
│   ├── chat/
│   ├── presence/
│   ├── media/
│   ├── call/
│   ├── notification/
│   ├── recording/
│   └── bot-gateway/         (Phase 10 — README only, hozir empty)
├── shared/
│   ├── proto/               (kelajakda gRPC)
│   └── openapi/             (har servisning OpenAPI YAML)
├── nova-integration/
│   ├── composer-package/    (Laravel package)
│   └── nova-tool/           (Vue Nova tool, i18n: uz+ru)
├── mobile/                  (Flutter app, uz+ru)
├── assets/
│   └── audio/
│       ├── recording_uz.mp3
│       ├── recording_ru.mp3
│       └── hold_music.mp3
├── tests/
│   ├── e2e/
│   └── load/
├── docs/
│   ├── api/                 (auto-generated from OpenAPI)
│   ├── architecture.md
│   └── runbooks/            (incident response)
└── scripts/
    ├── seed-dev-data.sh
    ├── upload-system-audio.sh
    └── backup.sh
```

---

## 17. Makefile

```makefile
.PHONY: up down logs migrate seed test load-test reset-db audio-upload

up:
	docker compose up -d
	@echo "Waiting for services..."
	@sleep 8
	@docker compose ps
	$(MAKE) audio-upload

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose exec chat-service npm run migrate
	docker compose exec auth-service npm run migrate
	docker compose exec call-service npm run migrate

seed:
	docker compose exec chat-service npm run seed:dev

audio-upload:
	./scripts/upload-system-audio.sh

test:
	docker compose exec chat-service npm test
	docker compose exec auth-service npm test
	docker compose exec call-service npm test

load-test:
	k6 run tests/load/chat-flood.js

reset-db:
	docker compose down -v
	docker compose up -d postgres minio redis rabbitmq
	@sleep 10
	docker compose up -d
	$(MAKE) migrate seed audio-upload
```

---

## 18. Quriladigan tartibga rioya qilish (AI agent uchun)

**Phase 1 — Skeleton (1-kun):**
1. Repo strukturasi (16-bo'lim)
2. `docker-compose.yml` + infra config'lar
3. `docker compose up -d` ishlasin
4. PostgreSQL migration (6-bo'lim) — `system_message_templates` ham seed bo'lsin
5. RabbitMQ exchange + queue'lar yaratish (bot.inbox ham — bo'sh consumer)

**Phase 2 — Auth (1-2-kun):**
6. auth-service to'liq (7.1) — locale field bilan
7. Centrifugo token endpoint
8. Nova SSO endpoint
9. Postman/Bruno collection

**Phase 3 — Chat (3-4-kun):**
10. chat-service to'liq (7.2)
11. System message i18n logikasi
12. Centrifugo publish
13. RabbitMQ event publish
14. E2E test: 2 user, xabar yuborish (uz + ru)

**Phase 4 — Media (1-kun):**
15. media-service + MinIO presigned upload
16. Thumbnail generation

**Phase 5 — Presence + Notification (1-2-kun):**
17. presence-service + operator status
18. notification-service + FCM test (lokal'da console log fallback)
19. i18n template'lari

**Phase 6 — Call: asosiy (3-kun):**
20. LiveKit setup, token generation
21. call-service: initiate, answer, hangup
22. ACD algoritmi (til + skill filter)
23. Hold music + queue
24. Test: 2 brauzer, audio call

**Phase 7 — Call: transfer (2-kun):**
25. Cold transfer
26. Warm transfer (consult room)
27. Test: 3 brauzer (mijoz + 2 operator)

**Phase 8 — Call: recording (2-kun):**
28. recording-service + LiveKit Egress
29. Consent audio prompt flow (Centrifugo `play_audio`)
30. Recording start/stop + MinIO upload
31. Audit log
32. Access control (faqat tegishli operator/admin)

**Phase 9 — Nova integration (2-3-kun):**
33. SSO controller
34. Vue Nova Tool (rooms, messages, in-call, transfer dialog, recording button)
35. i18n (uz+ru)
36. End-to-end: Nova operator ↔ Flutter mijoz

**Phase 10 — Flutter app (5-7-kun):**
37. Auth flow (OTP) + locale picker
38. Chat UI (uz+ru)
39. CallKit + incoming call
40. In-call UI + recording indicator
41. Push notification (FCM + APNs)

**Phase 11 — Testing & polish (3-kun):**
42. Load test (10K connection)
43. Bug fix
44. Documentation

**Jami: ~4-5 hafta** bitta tajribali full-stack developer uchun.

---

## 19. Kelajak versiyalar (v2+)

**Phase 12 — Bot Integration (1-2 hafta):**
- bot-gateway service yozish
- `bot.inbox` queue consumer
- FAQ bot (oddiy intent matching, JSON config)
- AI bot (Claude/GPT API integration)
- Handoff logic (mijoz "operator" deydi yoki bot confidence past)
- Bot tomonidan tugmali javoblar (`bot_quick_reply` message type)

**Phase 13 — KPI Dashboard:**
- Reporting service yoki Nova ichida sahifa
- SQL view'lardan tortib metric'lar (yuqorida tayyor)
- Grafana dashboards: response time, AHT, agent productivity, queue analytics
- CSAT survey (qo'ng'iroq oxirida mijozdan 1-5 yulduz)
- Export: CSV, Excel (xlsx)

**Phase 14 — Advanced:**
- PSTN integration (Twilio yoki UzMobile B2B SIP trunk) — agar biznes o'zgarsa
- E2EE (Signal Protocol)
- Video calls (operator ↔ supervisor uchun ham qo'shish oson — LiveKit allaqachon video qo'llab-quvvatlaydi)
- Screen sharing (operator brauzeri'da)
- Co-browsing (mijoz brauzeriga "qaragan" operator)

---

## 20. Foydalanuvchi qarorlari xulosasi

| Savol | Qaror | Implementatsiya |
|---|---|---|
| 1. PSTN | **Yo'q** — faqat ilova ichida | FreeSWITCH olib tashlandi, faqat LiveKit |
| 2. Recording | **Operator yoqsa** | `/calls/:id/recording/start` endpoint, audio prompt majburiy |
| 3. Group chat | **Yo'q, lekin transfer kerak** | Cold + warm transfer to'liq implementatsiya |
| 4. Bot | **Keyin (Phase 10)** | Schema, RabbitMQ queue, role tayyor; servis stub |
| 5. Til | **uz + ru** | Backend i18n, DB templates, Vue/Flutter ARB |
| 6. KPI | **Keyingi versiyada** | Data collect qilinadi (CDR), views tayyor, dashboard v2 |
| 7. Video | **Yo'q, audio yetarli** | LiveKit audio-only config, video disabled |

---

## 21. Maslahat va ogohlantirishlar

**❌ Yo'l qo'ymang:**
- WebSocket'da business logic — faqat publish/subscribe
- DB'ga to'g'ridan-to'g'ri WebSocket handler'dan yozish — har doim REST API orqali
- File upload'ni service'ga proksi qilish — har doim MinIO/S3'ga direct
- **Recording'ni ogohlantirishsiz boshlash — bu jinoyat**
- System message'ni faqat bir tilda yuborish — har doim JSON `{uz, ru}`
- Bot'siz ishlasak ham `bot.inbox` queue'ni RabbitMQ'da yaratmaslik
- Operator tili mijoz tiliga mos kelmasa ham unga biriktirish

**✅ Doim qiling:**
- Idempotency key (`client_message_id`)
- Correlation ID har request'da
- Health check har servisda (`/healthz`, `/readyz`)
- Graceful shutdown (SIGTERM bilan 30s wait)
- DB connection pool 20-50
- Centrifugo behind sticky LB (production)
- Audit log har bir sezgir amal
- Recording faqat `consent_announced=true` bo'lsa
- Til bo'yicha operator filter (mijoz uz, operator faqat ru bilsa → match emas)
- LiveKit token TTL kichik (1 soat) — har join'da yangi
- Recording access har gal audit log
- Transfer paytida atomic claim (Redis lock) — race condition oldini olish

---

## 22. Foydali havolalar

- Centrifugo: https://centrifugal.dev/
- LiveKit: https://docs.livekit.io/
- LiveKit Egress: https://docs.livekit.io/home/egress/overview/
- NestJS: https://docs.nestjs.com/
- nestjs-i18n: https://nestjs-i18n.com/
- Flutter Callkit: https://pub.dev/packages/flutter_callkit_incoming
- LiveKit Flutter: https://pub.dev/packages/livekit_client
- Laravel Nova: https://nova.laravel.com/docs/
- TimescaleDB: https://docs.timescale.com/
- k6 load testing: https://k6.io/docs/
- Prisma: https://www.prisma.io/docs/
- Meilisearch: https://www.meilisearch.com/docs

---

**Dokument oxiri. Versiya 1.1. Savollar bo'lsa — `docs/architecture.md` ga qo'shing va keyingi iteratsiyada hal qilamiz.**
