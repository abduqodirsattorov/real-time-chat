# Nova Chat & Call Platform — STATUS

## Holat: To'liq ishlaydi (lokal)

## Ishlaydigan funksiyalar
- Real-time chat (2 yo'nalish, fayl, typing, read receipt, unread badge)
- Audio call (2 yo'nalish): mijoz↔operator
  - Gudok ovozi (ringback/ringtone, Web Audio)
  - Navbat (queue) — barqaror, operator olguncha turadi
  - Sinxron tugatish (bir tomon tugatsa ikkalasida ham)
  - Transfer (cold/warm), recording (consent bilan)
- Admin panel (/admin): operator yaratish, email+parol login, parol o'zgartirish
- Notification, Meilisearch search, bot (FAQ)

## Arxitektura
- 8 backend mikroservis (NestJS): auth:3001, chat:3002, presence:3003,
  media:3004, call:3005, notification:3006, recording:3007, bot-gateway:3008
- operator-panel/ — Vue 3 SPA (localhost:5173)
- client/ — Flutter mijoz (localhost:8889, web)
- Infra: PostgreSQL+TimescaleDB, Redis, MinIO, RabbitMQ, Meilisearch,
  Centrifugo, LiveKit, Traefik, Prometheus, Grafana

## Ishga tushirish
```
1. cd C:\Users\abduq\OneDrive\Documents\real-time-chat
2. docker compose up -d
3. cd operator-panel && npm run dev  → localhost:5173
4. cd client && $env:Path += ";C:\Users\abduq\flutter_sdk\flutter\bin" &&
   flutter run -d web-server --web-port 8889  → localhost:8889
```

## Login
- Admin: `admin@pusher.uz` / `Admin12345` (Email tab)
- Operator OTP: `+998900000002` (Telefon tab)
- Mijoz: `+998900000001` (Flutter)
- OTP olish: `docker compose logs auth-service | Select-String OTP`
- **MUHIM:** operator "Mavjud" (Available) qilishi kerak, aks holda call kelmaydi

## Muhim texnik eslatmalar
- Centrifugo kanal: `chat:room#<id>`, `chat:user#<id>` (# belgi bilan)
- `operator_states` jadval ustuni: `user_id` (`operator_id` EMAS!)
- Mijoz: OTP login. Operator/admin: OTP yoki email+parol
- Prisma schema `init.sql` bilan AYNI bo'lishi shart
- Muhit: Windows + Docker Desktop + WSL2, PowerShell
- PowerShell'da `grep` o'rniga `Select-String` ishlatiladi

## Tuzatilgan regressiyalar (tarix CHANGELOG.md da)
- Status flapping (operator available→offline 10s avtomatik)
- `operator_states` yo'q edi (admin yaratgan operatorlarda)
- Jim `catch(()=>{})` critical flow'da
- Ringback Flutter `call.initiate`ni bloklagan (`dart:js_util` import)
- Call lifecycle: navbat timeout (10s→barqaror), sinxron tugatish
- Queue processor `onCall` tekshirmasdi → queued call 15s da yo'qolardi

## Keyingi mumkin ishlar
1. Admin panel to'ldirish: statistika/KPI dashboard, sozlamalar (bot, recording, til), monitoring
2. Production: VPS/server, HTTPS, domen, `change_me` secretlarni almashtirish
3. Android: CallKit, background push, real FCM/APNs (hozir faqat web)
4. Yuklama testi (100K user — Phase 11), keyin ACD optimization (DB→Redis ZSET)

## Yangi chat ochganda
Bu faylni o'qib boshlang: `@docs/STATUS.md`
Keyin vazifani ayting.
