# call-service — Port 3005

Call center servisi. Inbound/outbound qo'ng'iroqlar, ACD navbat, cold/warm transfer, recording boshqaruv, LiveKit integratsiya.

## Endpointlar

| Method | Path | Tavsif |
|--------|------|--------|
| POST | `/calls/initiate` | Mijoz inbound qo'ng'iroq boshlash |
| POST | `/calls/outbound` | Operator → mijoz qo'ng'iroq |
| POST | `/calls/:id/answer` | Qo'ng'iroqni qabul qilish |
| POST | `/calls/:id/hangup` | Qo'ng'iroqni tugatish |
| POST | `/calls/:id/hold` | Hold / unhold |
| POST | `/calls/:id/mute` | Mute / unmute |
| POST | `/calls/:id/transfer` | Cold yoki warm transfer boshlash |
| POST | `/calls/:id/transfer/complete` | Warm transfer yakunlash |
| POST | `/calls/:id/transfer/cancel` | Warm transfer bekor qilish |
| POST | `/calls/:id/recording/start` | Recording boshlash (operator) |
| POST | `/calls/:id/recording/stop` | Recording to'xtatish |
| POST | `/calls/:id/recording/consent-ack` | Client audio prompt tugaganini tasdiqlash |
| GET | `/calls/:id` | Qo'ng'iroq detallari |
| GET | `/calls` | Qo'ng'iroqlar tarixi |
| POST | `/livekit/token` | LiveKit join token |
| POST | `/livekit/webhook` | LiveKit server eventi |
| GET | `/healthz` | Health check |
| GET | `/metrics` | Prometheus metrics |

## Recording — HUQUQIY TALAB (KRITIK!)

O'zbekiston qonunchiligiga muvofiq, mijozni ogohlantirmasdan yozish **TAQIQLANGAN**.

Kod-level enforcement:
1. `recording.start` → `consent_announced=false`
2. Centrifugo orqali audio prompt har ikki tomonga
3. Client `consent-ack` POST → `consent_announced=true`
4. Faqat shundan keyin LiveKit Egress boshlanadi
5. Agar 10s ichida ack kelmasa → `status=failed`, egress boshlanmaydi

## Transfer turlari

**Cold (blind):** Operator A disconnect → Operator B invite → system message  
**Warm (attended):** Consult room → 2 operator gaplashadi → Complete/Cancel

## Muhit o'zgaruvchilar

```
DATABASE_URL, REDIS_URL, RABBITMQ_URL
CENTRIFUGO_API_URL, CENTRIFUGO_API_KEY
LIVEKIT_HOST=http://host.docker.internal:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_SECRET=32+ belgi
RECORDING_ANNOUNCEMENT_URL_UZ
RECORDING_ANNOUNCEMENT_URL_RU
HOLD_MUSIC_URL
PORT=3005
```
