# Nova Chat & Call Platform — v1.1

Telegram darajasidagi real-time chat + call center sistema. Nova (Laravel) dashboard va Flutter mobile ilova bilan integratsiya.

## Tezkor boshlash (AI agent uchun)

1. **Avval o'qing:** `TECHNICAL_SPECIFICATION.md` — to'liq spec (22 bo'lim, ~94KB)
2. **Tartib:**
   - Section 1-4: kontekst (majburiy)
   - Section 5-6: `docker-compose up` + DB migration
   - Section 7: mikroservislarni Section 18-dagi tartibda yozing
3. **Phase plan:** Section 18 (Phase 1 → Phase 11)

## Asosiy stack
- **WebSocket:** Centrifugo (Go) — 1M+ concurrent
- **Backend:** NestJS (Node.js + TS) mikroservislari
- **Database:** PostgreSQL 16 + TimescaleDB
- **Audio:** LiveKit (WebRTC SFU) — PSTN yo'q
- **Mobile:** Flutter + Centrifuge + LiveKit + CallKit
- **Nova:** Laravel Echo + Vue Nova Tool
- **Storage:** MinIO (S3-compatible)
- **Search:** Meilisearch (uz+ru)
- **Queue:** RabbitMQ (bot uchun ham)
- **Push:** FCM + APNs (VoIP)
- **Monitoring:** Prometheus + Grafana + Loki

## Foydalanuvchi qarorlari (Section 20)

| Savol | Qaror |
|---|---|
| PSTN | Yo'q — faqat ilova ichida |
| Recording | Operator yoqsa (huquqiy ogohlantirish bilan) |
| Group chat | Yo'q, lekin call transfer bor (cold + warm) |
| Bot | Phase 10 (schema tayyor) |
| Til | O'zbek (lotin) + Rus |
| KPI dashboard | Phase 13 (data hozir yig'iladi) |
| Video call | Yo'q, audio yetarli |

## Imkoniyatlar (Phase 1-11)
- Real-time 1-1 chat (mijoz ↔ operator) — uz+ru
- Fayl almashinuv (rasm, video, audio, document, voice message)
- Inbound qo'ng'iroq + ACD navbat ("Operator topilmoqda" musiqa)
- Outbound qo'ng'iroq (operator → mijoz, CallKit)
- **Call transfer (cold + warm)** — boshqa operatorga yo'naltirish
- **Recording on-demand** — operator yoqadi, audio prompt majburiy
- Push notification (offline xabar, missed call)
- Operator presence (available/busy/away/on_call/in_transfer)
- Chat history search (uz+ru)
- Nova SSO integratsiya
- Multi-language support (uz+ru, til bo'yicha operator filter)

## Kelajak (Phase 12+)
- Bot (FAQ + AI assistant)
- KPI dashboard
- PSTN (agar kerak bo'lsa)
- E2EE
- Video + screen share

## Vaqt prognozi
~4-5 hafta to'liq lokal MVP uchun (Phase 1-11).
