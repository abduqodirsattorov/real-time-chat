# Nova Chat & Call Platform — STATUS

## Holat: To'liq ishlaydi (lokal) — 25/25 Xavfsizlik & Arxitektura takomillashtirildi ✅

## Ishlaydigan funksiyalar

### Xavfsizlik & Arxitektura Qat'iyligi (25 Band) ✅
- **Centrifugo Proxy Auth (P0)**: `allow_subscribe_for_client: false`, `/webhooks/centrifugo/subscribe` orqali xona, foydalanuvchi va mahsulot ruxsatlari server-side tekshiriladi.
- **LiveKit Token & Call Security (P0)**: LiveKit tokenlari faqat qo'ng'iroqning haqiqiy ishtirokchilariga beriladi. Call endpointlariga (queue, getCall, hangup, mute, hold) qat'iy avtorizatsiya qo'shildi.
- **Media Access Control (P0)**: `GET /media/:id` va `GET /media/:id/thumbnail` da yuklovchi, xona a'zoligi va mahsulot ruxsati tekshiriladi.
- **Auth-Service Security (P0)**: `crypto.randomInt` orqali xavfsiz OTP generatsiyasi, 5 ta xato urinishdan so'ng OTP bloklanishi, Nova SSO to'liq payload HMAC tekshiruvi.
- **Operator Product Switching (P0)**: `PATCH /operator/product` da operatorning `operator_products` ruxsati server-side tekshiriladi.
- **Cross-Tenant Isolation (P0)**: Operatorlar uchun mahsulot filtri qat'iylashtirildi, ruxsatsiz mahsulot xonalariga kirish bloklandi.
- **Call-to-Recording M2M Auth (P1)**: `call-service` va `recording-service` o'rtasida `x-internal-service-key` orqali xavfsiz ichki aloqa o'rnatildi.
- **Operator Panel Call API Alignment (P1)**: Operator panelidagi `hold`, `resume`, `transfer` (cold/warm), `recording` va `livekitToken` yo'nalishlari backend bilan 100% sinxronlashtirildi.
- **Frontend Single-Flight Token Refresh (P1)**: Parallel 401 so'rovlarida yagona refresh promise orqali sessiya o'chib ketishining oldi olindi.
- **Database Schema Konsolidatsiyasi (P-1, P2)**: `shared/prisma/schema.prisma` master schema yaratildi va barcha mikroservislarga sinxronlandi.
- **DTO & Enum Alignment (P2)**: `RoomStatus` va `RoomType` enumlari DTO va bazada to'liq moslashtirildi.
- **Strict Validation (P2)**: Barcha NestJS xizmatlarida `forbidNonWhitelisted: true` yoqildi.
- **Call Transactions & ACD Claims (P2)**: Qo'ng'iroqlar `prisma.$transaction` da boshqariladi, operator claim qulflari qo'ng'iroq tugashi bilan darhol bo'shatiladi.

### Chat & Call (yadro)
- Real-time chat (2 yo'nalish, fayl, typing, read receipt, unread badge)
- Audio call (2 yo'nalish): mijoz↔operator
  - Gudok ovozi (ringback/ringtone, Web Audio)
  - Navbat (queue) — barqaror, operator olguncha turadi
  - Sinxron tugatish (bir tomon tugatsa ikkalasida ham)
  - Transfer (cold/warm), recording (consent bilan)
- Admin panel (/admin): operator yaratish, email+parol login, parol o'zgartirish
- Notification, Meilisearch search, bot (FAQ)

### Multi-tenancy (0-BOSQICH) ✅
- `products` jadval: branding JSONB (logo, rang, nom), soft delete
- `rooms.product_id` + `calls.product_id` → product izolyatsiya
- `operator_states.current_product_id` → ACD product routing
- Login → product tanlash ekrani → dashboard
- X-Product-Id header → barcha API so'rovlarda (axios interceptor)
- ACD: mijoz productId → operator currentProductId moslashtirish
- Admin product CRUD: yaratish, tahrirlash, o'chirish (soft delete)
- Operator ↔ product ruxsat: `operator_products` junction jadval, admin boshqaradi
- Default product: "Asosiy" (#3B6FF5, UUID: 00000000-0000-0000-0000-000000000002)
- API: GET/POST/PATCH /products, PATCH /operator/product

### Mijoz profil paneli (1-BOSQICH) ✅
- `customers` jadval: product_id, user_id, external_uid (Nova uid), profile_data JSONB, notes, tags
- Chat o'ngida collapsible profil paneli (260px ↔ 44px)
- Avatar, ism, telefon, pasport, millat, tug'ilgan sana, til, UID, fuqarolik, identifikatsiya holati
- Teglar (qo'shish/o'chirish inline), izoh (click-to-edit, blur'da saqlash)
- "Tranzaksiyalarini ko'rish" tugmasi → tranzaksiya bo'limiga o'tish (filter bilan)
- Suhbat tarixi (collapsible): har oldingi suhbat, holat badge, oxirgi xabar, bosilganda ochiladi
- API: GET /customers/by-room/:roomId, GET /customers/by-uid/:uid,
  POST /customers/upsert, PATCH /customers/:id, GET /customers/:id/history

### Tranzaksiya bo'limi (2-BOSQICH) ✅
- `transactions` jadval: product_id, external_id, user_uid, data JSONB (universal — har format)
- Jadval: ustunlar field config bo'yicha dinamik (admin sozlaydi)
- Qidiruv: telefon yoki ext_id bo'yicha (avtomatik, 400ms debounce)
- Filtr: sana (dan/gacha), provider, tur, debit holati, kredit holati, strana — dropdown
- Pagination: 20 ta/sahifa, sahifa raqamlari (ellipsis bilan)
- Belgilash: har qatorda checkbox, "hammasini tanlash" (shu sahifa / barcha sahifalar)
- Bulk amallar: 7 ta (stub — Nova API kerak)
- Detal panel: field config bo'yicha top maydonlar + "Barcha maydonlar" collapsible
- **Detalda Chat**: shu tranzaksiya egasining suhbati (collapsible, xabar yozish mumkin)
- Chatdan "Tranzaksiyalarini ko'rish" → avtomatik userUid filtr (banner telefon raqam ko'rsatadi)
- Product izolyatsiya
- API: GET /transactions, GET /transactions/:id, POST /transactions/upsert

### Admin Field Config (4-BOSQICH) ✅
- `field_configs` jadval: product_id, context (tx_table/tx_detail/profile), field_key, visible, sort_order, display_type
- Yangi product → default config avtomatik (auto-seed)
- Admin UI: toggle ko'rsat/yashir, tartib (▲▼), nom tahrirlash, display_type (text/badge/amount/date)
- Operator: tranzaksiya jadval + detal + profil — config bo'yicha dinamik render
- 3 ta context — alohida tab: Tranzaksiya jadval / Tranzaksiya detal / Mijoz profil
- API: GET /field-configs?context=..., PATCH /field-configs (bulk)

### Bildirishnoma (yangi murojaat) ✅
- Yangi room assign → real-time: ovoz (Web Audio ding) + badge + tab title + brauzer notification
- Yangi xabar → ovoz + unread badge + tab title `(N) Nova Chat — Operator` + brauzer notification
- Call ringtone alohida — buzilmadi
- Backend: `room.assigned` Centrifugo event via shaxsiy kanal (`chat:user#<id>`)

### Operator status kengaytirish ✅
- Holatlar: Mavjud (available) / Band (busy) / Tanaffus (break) / Oflayn (offline)
- ACD: faqat `available` operatorga call/chat (busy/break → ACD o'tkazib yuboradi)
- Ranglar: yashil/sariq/ko'k/kulrang
- Status flapping qaytmadi (reconnect watcher desiredStatus tiklaydi)

### Suhbat teglari ✅
- `tags` jadval: product_id, name, color — admin sozlaydigan teg katalogi
- `rooms.tag_ids UUID[]` — operator room'ga teg qo'yadi
- Admin: teg yaratish, tahrirlash, o'chirish (catalog)
- Operator: room header'da teg badge + qo'shish/olib tashlash dropdown
- Inbox filtr: teg bo'yicha filtrlash
- API: GET/POST/PATCH/DELETE /tags, PATCH /rooms/:id/tags

### Inbox customer search ✅
- Telefon raqam bo'yicha qidirganda yozishma bo'lmagan mijoz ham ko'rinadi
- "Mijoz" bo'limi: suhbati bor → room ochiladi; yo'q → ko'rsatiladi
- API: GET /rooms/search-user?phone=

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
- **MUHIM:** login → product tanlash ekrani → "Davom etish" → "Mavjud" avtomatik

## Test
```powershell
cd C:\Users\abduq\OneDrive\Documents\real-time-chat\tests\integration
npx jest operator.test.ts multitenancy.test.ts transactions.test.ts --testTimeout=30000 --forceExit
# → 58/58 PASS
```

## Muhim texnik eslatmalar
- Centrifugo kanal: `chat:room#<id>`, `chat:user#<id>` (# belgi bilan)
- `operator_states` jadval ustuni: `user_id` (`operator_id` EMAS!)
- `operator_states.current_product_id` — operator qaysi productda (ACD uchun)
- Mijoz: OTP login. Operator/admin: OTP yoki email+parol
- Prisma schema `init.sql` bilan AYNI bo'lishi shart
- Muhit: Windows + Docker Desktop + WSL2, PowerShell
- PowerShell'da `grep` o'rniga `Select-String` ishlatiladi
- X-Product-Id header: localStorage['selected_product_id'] → axios interceptor
- Universal JSONB: transactions.data, customers.profile_data — har format (null/son/list/object)
- `@IsUUID()` validator `00000000-0000-0000-0000-000000000002` ni qabul qilmaydi —
  productId fieldlarida `@IsString()` ishlatiladi (DB UUID formatni tekshiradi)
- Field configs: yangi product birinchi `GET /field-configs` da auto-seed oladi

## Tuzatilgan regressiyalar (tarix CHANGELOG.md da)
- Status flapping (operator available→offline 10s avtomatik)
- `operator_states` yo'q edi (admin yaratgan operatorlarda)
- Jim `catch(()=>{})` critical flow'da
- Ringback Flutter `call.initiate`ni bloklagan (`dart:js_util` import)
- Call lifecycle: navbat timeout (10s→barqaror), sinxron tugatish
- Queue processor `onCall` tekshirmasdi → queued call 15s da yo'qolardi
- Flutter 400: `@IsUUID()` → `@IsString()` (00000000-0000-0000-0000-000000000002 rejected)
- Dublikat suhbatlar: DB unique index (partial) + Redis lock + DB tozalash

### Nova API integratsiya poydevori (5-BOSQICH, 1-qism) ✅
- Mock Nova server (`services/mock-nova/`, port 3009): barcha spec endpointlari
- HMAC-SHA256 imzo tekshirish (timingSafeEqual, timing attack himoyasi)
- Nova API client (`NovaService`): HMAC imzolash, retry (3 urinish, exponential backoff)
- `GET /api/v1/nova/health` (public), `/nova/test/profile`, `/nova/test/actions`, `/nova/test/action`
- 23/23 nova test PASS, 58/58 regressiya PASS

## Keyingi bosqichlar

**Nova API tayyor bo'lganda:**
- **3-BOSQICH:** Tranzaksiya actionlari (Recredit, Pulni qaytarish, Resend...) — Nova API kerak
- **5-BOSQICH (2-qism):** Pull integratsiya (profil/tx real-time Nova'dan), webhook (Nova → biz, HMAC + RabbitMQ), action bajarish (rol + audit log + idempotency)

**Production deploy tayyor bo'lganda:**
- Server (Ubuntu 22.04), HTTPS (Let's Encrypt), domen
- `change_me` secret'larni almashtirish (JWT_SECRET, CENTRIFUGO_API_KEY, ...)
- DB backup (pg_dump cron), Sentry error tracking
- docker compose --env-file .env.prod up -d

**Nova API integratsiya uchun kerak bo'ladi:**
- Transfer endpoint (GET tranzaksiya, POST action)
- Profile endpoint (GET mijoz profil)
- Auth (token/key)
- Real JSON namunasi (maydon turlari aniqlash uchun)

## Yangi chat ochganda
Bu faylni o'qib boshlang: `@docs/STATUS.md`
Keyin vazifani ayting.
