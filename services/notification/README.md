# notification-service — Port 3006

Push notification servisi. RabbitMQ consumer. FCM (Android) va APNs (iOS CallKit/VoIP) push yuboradi.

## Arxitektura

RabbitMQ `notification.push` queue'ni eshitadi.  
HTTP REST yo'q — faqat event-driven.

## Qo'llab-quvvatlanadigan eventlar

| Event | Trigger | Push turi |
|-------|---------|-----------|
| `message.created` | Oluvchi offline/background | FCM notification |
| `call.initiated` (operator target) | Operator qo'ng'iroq keldi | VoIP push (APNs) + FCM high-priority |
| `call.ended` (no_answer) | Missed call | FCM notification |

## Push payload'lar

**FCM (yangi xabar):**
```json
{
  "priority": "high",
  "notification": { "title": "Sender ismi", "body": "Xabar matni" },
  "data": { "type": "chat_message", "room_id": "...", "message_id": "..." }
}
```

**VoIP (iOS CallKit):**
```json
{
  "aps": { "content-available": 1 },
  "type": "incoming_call",
  "call_id": "...",
  "livekit_url": "...",
  "livekit_token": "..."
}
```

## Lokal dev rejimi

`secrets/fcm-service-account.json` va `secrets/apns.p8` bo'lmasa — servis console.log fallback ishlatadi. Test uchun real token kerak emas.

## Muhit o'zgaruvchilar

```
DATABASE_URL, REDIS_URL, RABBITMQ_URL
FCM_SERVICE_ACCOUNT_PATH=/secrets/fcm-service-account.json
APNS_KEY_PATH=/secrets/apns.p8
APNS_KEY_ID, APNS_TEAM_ID
APNS_TOPIC=com.nova.app
APNS_VOIP_TOPIC=com.nova.app.voip
PORT=3006
```

## i18n

Push matnlar oluvchi `users.locale` bo'yicha tanlanadi.  
Templatelar: `locales/uz.json`, `locales/ru.json`
