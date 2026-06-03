# CHANGELOG

## 2026-06-03 — 1-BOSQICH: Mijoz profil paneli

### Qo'shildi

**DB:**
- `customers` jadval (allaqachon init.sql da bor edi): product_id, user_id, external_uid, profile_data JSONB, notes, tags
- `migrate_customers.sql` — mavjud DBga xavfsiz qo'shish
- trigger: `trg_customers_updated_at` avtomatik updated_at yangilash

**Backend (chat-service):**
- `GET /customers/by-room/:roomId` — room orqali customer profil (upsert bilan avtomatik yaratish)
- `GET /customers/by-uid/:uid` — Nova external_uid bo'yicha qidirish
- `POST /customers/upsert` — external_uid yoki userId bo'yicha yaratish/yangilash (Nova integratsiya poydevori)
- `PATCH /customers/:id` — operator izoh (notes) va teg (tags) saqlash
- Izolyatsiya: operator faqat o'z product mijozlarini ko'radi
- DTO fix: `@IsUUID()` → `@IsString()` (default UUID `000...002` v4 validation o'tmaydi)

**Frontend (operator-panel):**
- `CustomerProfilePanel.vue` — chat o'ngida profil paneli
  - Yig'ish/ochish (collapsible, 260px → 44px)
  - Avatar (ism initials, rang userId dan)
  - Maydonlar: ism, telefon, pasport, millat, tug'ilgan sana, til, UID, fuqarolik, identifikatsiya holati (✓/✗), ro'yxatdan o'tgan
  - Teglar (qo'shish/o'chirish, inline edit)
  - Izoh (click-to-edit textarea, blur da saqlanadi)
  - "Tranzaksiyalarini ko'rish" tugmasi (disabled — 2-bosqich)
  - Noma'lum mijoz holati
- `api/customers.ts` — getByRoom, upsert, update
- `ChatView.vue` — CustomerProfilePanel integratsiya qilindi
- `i18n uz.json + ru.json` — `profile.*` kalitlari qo'shildi (22 ta kalit)

**Test natijalari:**
- `GET /customers/by-room/:id` → avtomatik upsert, user info bilan ✓
- `POST /customers/upsert` → profile_data JSONB saqlanadi ✓
- `PATCH /customers/:id` — notes/tags yangilanadi ✓
- Product izolyatsiya: customers productga bog'liq ✓
- Chat o'ngida profil paneli ko'rinadi ✓

**Testlash:**
```
1. localhost:5173 → login → product tanlash → chat
2. Suhbat ochish → o'ngda "Profil" paneli ko'rinadi
3. Test profil: POST /customers/upsert (nova profil data bilan)
4. Profil: ism, pasport, identifikatsiya ko'rinadi
5. Operator izoh yozadi (blur da saqlanadi)
6. Teg qo'shadi (Enter/blur)
7. Boshqa product suhbatida customer ko'rinmaydi (izolyatsiya)
```

---

## 2026-06-03 — Call history product izolyatsiya bugfix

### Root cause (3 ta muammo birgalikda)

**1. Null product_id calllar (asosiy sabab)**
Migration `migrate_multitenancy.sql` faqat mavjud calllarni default productga o'tkazdi.
Lekin call-service rebuild qilinguncha (productId fieldi qo'shilguncha) qilingan yangi calllar
`product_id = NULL` bilan saqlandi. `NULL != 'yubor_id'` bo'lgani uchun ular Yubor filterida
ham, Default filterida ham to'g'ri ishlardi — lekin header bo'lmasa hammasi ko'rinardi.

**Tuzatildi (DB):**
```sql
UPDATE calls SET product_id = '00000000-0000-0000-0000-000000000002' WHERE product_id IS NULL;
```
4 ta NULL call default productga o'tkazildi.

**2. Outbound call productId saqlamadi**
`POST /calls/outbound` operator `current_product_id` ni callga saqlamardi.

**Tuzatildi (`calls.service.ts`):**
Outbound call yaratilganda `opState.currentProductId` dan oladi → `productId` saqlanadi.

**3. Backend filter to'g'ri ishlaydi (emas muammo)**
`GET /calls` + `X-Product-Id: Yubor` → 0 ta call (to'g'ri).
`GET /calls` + `X-Product-Id: Default` → 48 ta call (to'g'ri).
Frontend interceptor X-Product-Id header yuboradi (browser logdan tasdiqlandi).

### Diagnostika natijalari
- azim azim (b837b2a9) calllar: 48 ta (hammasi Default product, NULL yo'q) ✓
- Backend Yubor filter: 0 call qaytaradi ✓
- Backend Default filter: to'g'ri call qaytaradi ✓
- Vite devserver hot-reload bo'lgan bo'lishi mumkin — brauzerde hard refresh kerak bo'lishi mumkin

### Test tartibi
1. Brauzrni hard refresh (Ctrl+Shift+R)
2. Yubor productiga kir
3. QO'NG'IROQLAR → BO'SH bo'lishi kerak ✓
4. Asosiy → 48+ call ko'rinishi kerak ✓

---

## 2026-06-02 — Admin layout fix + Operator-product ruxsati

### MUAMMO 1 tuzatildi: Admin bo'limlari panel ichida

**Sabab:** Admin bo'limlari (`/admin/users`, `/admin/products`) MainLayout ichida
`<router-view />` da to'g'ri render bo'lar edi, lekin alohida sahifa ko'rinishida edi.

**Tuzatildi:**
- `AdminLayout.vue` (yangi) — 2 panel layout: chap sub-nav (Foydalanuvchilar | Productlar) + o'ng content
- Router restructure: admin routes `AdminLayout` ostiga nested (MainLayout → AdminLayout → AdminUsersView/AdminProductsView)
- MainLayout: bitta "Admin" nav icon (Users + Products alohida emas)

### Yangi funksiya: Operator ↔ Product ruxsati

**DB:**
- `operator_products (user_id, product_id)` junction jadval
- Migration: `infra/postgres/migrate_operator_products.sql`
- Mavjud 11 operator → default productga kiritildi

**Backend (auth-service):**
- `POST /admin/users` → `productIds[]` qabul qiladi
- `PATCH /admin/users/:id` → `productIds[]` yangilaydi (to'liq replace)
- `GET /admin/users` + `GET /admin/users/:id` → `productIds[]` qaytaradi
- `OperatorProduct` model Prisma schemaga qo'shildi

**Backend (chat-service):**
- `GET /products`:
  - Admin/supervisor → hamma (faol+nofaol)
  - Operator → faqat `operator_products` bo'yicha ruxsat etilgan (faol)
  - Boshqalar → faqat faollar

**Frontend:**
- `AdminUsersView.vue` — yangi operator yaratish modalida product checkboxlar
- `AdminUserDetailView.vue` — yangi "Productlar" tab: checkbox bilan ruxsatlarni o'zgartirish
- `AdminUserDetailView.vue` — operator bo'lmagan (admin) uchun Products tab yashiriladi
- `api/admin.ts` — `productIds` qo'shildi

**Test natijalari:**
- `PATCH /admin/users/:id { productIds: [] }` → ruxsat tozalandi ✓
- Admin GET /products → 2 (faol+nofaol) ✓
- Operator GET /products → faqat ruxsat etilganlari ✓

---

## 2026-06-02 — Admin panel Product CRUD

### Qo'shildi

**Backend (chat-service):**
- `DELETE /products/:id` — soft delete (is_active=false)
- `GET /products` — admin uchun hammasi (faol+nofaol), boshqalar uchun faqat faollar
- `PATCH /products/:id` — name, branding, settings, isActive tahrirlash
- slug unique tekshirish (POST da ConflictException)
- UpdateProductDto bilan to'liq validatsiya

**Frontend (operator-panel):**
- `AdminProductsView.vue` — product ro'yxati jadval (nom, slug, rang, holat)
- Nav iconı: admin sidebar'da "Productlar" bo'limi (monitor icon)
- Modal: yangi product yaratish (nom, slug, display name, rang picker, logo URL)
- Modal: tahrirlash (slug o'zgartirib bo'lmaydi, qolganlar)
- Soft delete + confirm modal
- Product picker: faqat faol productlar ko'rinadi
- `api/products.ts` to'ldirildi (create, update, remove, listAll)
- i18n uz/ru: product CRUD uchun barcha kalitlar
- Route: `/admin/products` → AdminProductsView

**Test natijalari:**
- `DELETE /products/:id` → is_active=false ✓
- `GET /products` (admin) → faol + nofaol ✓
- `PATCH /products/:id` → branding yangilandi ✓
- slug unique conflict → 409 ✓

---

## 2026-06-02 — 0-BOSQICH: Multi-tenancy poydevori

### Qo'shildi

**DB:**
- `products` jadval (tenant): id, name, slug, branding JSONB, settings JSONB, is_active
- `rooms.product_id` → products FK
- `calls.product_id` → products FK
- `operator_states.current_product_id` → operator qaysi productda ishlayotgani
- Migration script: `infra/postgres/migrate_multitenancy.sql` (mavjud data → default product)
- Default product: `00000000-0000-0000-0000-000000000002` ("Asosiy", slug="default")

**Backend:**
- `GET /products` — aktiv productlar ro'yxati (chat-service)
- `POST /products` — yangi product yaratish (admin only)
- `PATCH /products/:id` — branding/settings yangilash (admin only)
- `PATCH /operator/product { productId }` — operator product tanlaydi (presence-service)
- `GET /rooms` → `X-Product-Id` header bo'yicha filtrlash (operator izolyatsiya)
- `POST /support/request` → `productId` body'da → room'ga saqlash + ACD product filter
- `POST /calls/initiate` → `productId` body'da → call'ga saqlash + ACD product filter
- ACD (chat + call): `currentProductId` bo'yicha operator-customer moslashtirish
- Queue processor: product filter bilan operator qidirish

**Frontend (operator-panel):**
- `ProductPickerView.vue` — login → product tanlash ekrani
- `stores/product.ts` — selectedProductId, loadProducts, selectProduct
- `api/products.ts` — products API
- `api/client.ts` — `X-Product-Id` header har so'rovga qo'shiladi (localStorage dan)
- Router: login → product-picker (agar product tanlanmagan) → chat
- MainLayout: qayta kirish sessiyasida product tanlangan bo'lsa setStatus('available') chaqiriladi
- Logout: localStorage.clear() → product tozalanadi

**Infra:**
- Traefik: `/api/v1/products` → chat-service route qo'shildi
- Traefik CORS: `X-Product-Id` header qo'shildi

### Izolyatsiya mexanizmi

```
Mijoz (Flutter) → POST /support/request { productId: "A" }
  → room.product_id = A
  → ACD: operator_states.current_product_id = A bo'lgan operator

Operator (Vue) → product-picker → selects "A" 
  → PATCH /operator/product { productId: "A" }
  → GET /rooms (X-Product-Id: A) → faqat A rooms
  → GET /calls (X-Product-Id: A) → faqat A calls
```

### Test natijalari (curl)

- `GET /products` → `[{ "Asosiy", "#3B6FF5" }]` ✓
- `POST /products` → B product yaratildi ✓
- `PATCH /operator/product` → currentProductId yangilandi ✓
- `GET /rooms (X-Product-Id: A)` → 12 room ✓
- `GET /rooms (X-Product-Id: B)` → 0 room (izolyatsiya) ✓

### Mavjud funksiya regressiya yo'q
- Mavjud 12 room, 172 call → default product ga o'tkazildi
- Chat, call, transfer, recording — o'zgarmadi

---

## 2026-06-01 — Queue disappearing fix

### Bug: Navbatdagi call ~10 sekundda avtomatik yo'qoladi

**Sabab:** `queue.processor.ts` cron job (har 15s) `onCall: false` va `isOnline` tekshiruvisiz
operator qidirdi. Operator call'da bo'lsa ham (`onCall=true`) uni topib, queued call'ni
`status='ringing'`'ga o'tkazardi — shu bilan `getCallQueue` uni ko'rsatmay qo'ydi
(faqat `status='queued'` calllar ko'rsatiladi).

**Tuzatildi (`services/call/src/queue/queue.processor.ts`):**
- `onCall: false` filtri qo'shildi — faqat bo'sh operator topiladi
- `isOnline(op.userId)` Redis presence tekshiruvi qo'shildi — stale operatorlar o'tkazib yuboriladi
- `onCall: true` qilinadi — dispatch paytida operator band belgilanadi
- `if (!dispatched)` → callQueue SAQLANADI (o'chirilmaydi) — operator bo'shaganda retry

**Natija:** Navbatdagi call operator bo'shagunga qadar turadi. 15s marotaba retry.

---

## 2026-06-01 — Call lifecycle fix (hangup sync + queue real-time)

### Muammo 1 tuzatildi: Tugatish sinxron emas

**Sabab:** Operator `call:<callId>` kanaliga faqat javob BERGANdan keyin subscribe bo'lar edi.
Agar mijoz ring paytida chiqib ketsa → operator paneli `call.ended` eventini olmadi → incoming card qolib ketdi.

**Tuzatildi (`operator-panel/src/stores/calls.ts`):**
- `setIncomingCall` endi `async` — darhol `subscribeToCallChannel(call.id)` chaqiradi
- `subscribeToCallChannel` barcha holatlarni boshqaradi:
  - `call.ended` → incoming card YO'Q bo'lsa dismiss qiladi; active call bo'lsa tugatadi
  - `call.connected` → outbound call uchun LiveKit ulanadi
- `answerCall` — artiq re-subscribe qilmaydi (allaqachon subscribed)
- `dismissIncoming` — endi `callsApi.hangup()` chaqiradi → mijoz ham `call.ended` oladi
- `hangup` — call channel'dan unsubscribe qiladi

**Natija:**
- Mijoz ring paytida chiqib ketsa → operator panelida incoming card yo'qoladi ✓
- Operator rad etsa (X) → mijoz "call ended" oladi ✓  
- Bir tomon tugatsa → ikkinchi tomon ham tugaydi ✓

### Muammo 2 tuzatildi: Navbat (Queue) kech chiqishi va yo'qolishi

**Sabab 1:** `CallQueuePanel` 8 sekundda bir polling → queuega tushgan call kech ko'rindi.

**Sabab 2:** Queue panel real-time event olmadi.

**Tuzatildi:**
- `call-service` `initiateCall` (queued): barcha online operatorlarga `call.queued` Centrifugo event publish qiladi
- `MainLayout.vue`: `call.queued` event → `nova:queue-refresh` CustomEvent dispatch
- `CallQueuePanel.vue`: `nova:queue-refresh` event eshitadi → darhol refresh
- Polling interval: 8s → 5s (fallback)

**Natija:** 2-mijoz queuega tushganda operator panelida Navbat DARHOL ko'rinadi ✓

---

## 2026-06-01 — Inbound call fix + on_call guard + ringtone isolation

### Bug fix: Mijoz → operator inbound call ishlamadi

**Sabab:** `call_service.dart`'ga `import '../services/ringtone_service.dart'` qo'shildi.
`ringtone_service.dart` `dart:js_util` ishlatadi — bu Dart 3.6 da runtime xato berishi mumkin.
`CallService.initiateCall()` ichida `RingtoneService().startRingback()` chaqirilganda
xato sodir bo'lsa, `chat_screen.dart`'dagi `catch (_)` bloki uni yutib yuborardi va
`POST /calls/initiate` so'rovi backend'ga UMUMAN KELMADI.

**QOIDA (CHANGELOG'dan):** browser audio rejection jim OK, lekin CRITICAL FLOW'ni bloklamaslik kerak.

**Tuzatildi:**
- `call_service.dart`'dan `ringtone_service.dart` import va barcha `RingtoneService()` chaqiruvi olib tashlandi
- Ringtone chaqiruvlari `chat_screen.dart` va `call_screen.dart`'ga ko'chirildi
- API muvaffaqiyatdan KEYIN: `final active = await CallService().initiateCall(); RingtoneService().startRingback();`
- Izolatsiya: ringtone xatosi call flow'ga ta'sir qilmaydi

### Bug fix: Operator bir vaqtda bir nechta call qabul qilishi

**Sabab:** `operator_states.on_call` call-service Prisma schema'da YO'Q edi.
`findAvailableOperator` `onCall` tekshirmasdi → operator bir vaqtda cheksiz call qabul qilardi.

**Tuzatildi:**
- `services/call/prisma/schema.prisma`: `onCall Boolean @default(false) @map("on_call")` qo'shildi
- `findAvailableOperator`: `onCall: false` filtri qo'shildi
- `initiateCall`, `outboundCall`: operator topilganda `onCall = true` qilinadi
- `outboundCall`: operator allaqachon call'da bo'lsa 400 qaytaradi
- `hangupCall`: call tugaganda `onCall = false` qaytariladi
- call-service rebuild qilindi

### Tozalash: Eski stale calllar
9 ta `ringing`/`initiating` holatdagi eski call `no_answer` ga o'tkazildi.

### Flutter: `recoverState()` qo'shildi
App start'da `_activeCall` tekshiriladi — eski terminated call bo'lsa tozalanadi.

---

## 2026-06-01 — Operator Status Flapping Fix

### Root cause (status flapping)

Operator "Mavjud" bosadi → 10 soniyadan keyin avtomatik "offline" qaytadi.

**3 ta sabab bir vaqtda:**

**1. Frontend beacon — `visibilitychange` + `onUnmounted` (asosiy sabab)**

`operator-panel/src/views/MainLayout.vue` da:
```javascript
// NOTO'G'RI: tab hidden bo'lganda (DevTools ochganda, boshqa tabga o'tganda) offline yuborardi
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') setOfflineBeacon();
});

// NOTO'G'RI: Vite HMR fayl saqlaganda onUnmounted → offline
onUnmounted(() => {
  setOfflineBeacon(); // ← bu shart emas edi
});
```

**Fix:** `visibilitychange` handler olib tashlandi. `onUnmounted` dan `setOfflineBeacon()` olib tashlandi. Faqat `beforeunload` (tab/brauzer yopilganda) qoldi.

**2. Centrifugo disconnect webhook — `touchPresence` xatosi**

`services/presence/src/webhooks/webhooks.controller.ts`:
```typescript
// NOTO'G'RI: disconnect'da presence TTL'ni yangilaydi
// → isOnline() 30 daqiqa true qaytarardi, hatto foydalanuvchi offline bo'lsa ham
await this.presence.touchPresence(userId); // disconnect handler da
```

**Fix:** Disconnect webhook'dan `touchPresence` olib tashlandi. Endi `presence:user:<id>` kaliti faqat connect va `setStatus` da yangilanadi. 30 daqiqada o'z-o'zidan expire bo'ladi.

**3. Centrifugo reconnect'da status tiklanmaydi**

Centrifugo restart/disconnect bo'lsa → disconnect webhook → DB = 'offline'. Client reconnect qilinganda esa hech narsa 'available' qaytarmasdi.

**Fix:** `operator-panel/src/stores/presence.ts`:
```typescript
// Centrifugo reconnect bo'lganda desiredStatus'ni tiklaydi
watch(() => centrifuge.connected, async (isConnected, wasConnected) => {
  if (isConnected && !wasConnected && desiredStatus.value !== 'offline') {
    await presenceApi.setStatus(desiredStatus.value); // restore
  }
});
```

### Stale operator_states tozalash

`5df4ba3d` (Call Test) operatori DB da `status='available'` holda qolib ketgan edi.
ACD uni topib, u yerga call yo'naltirar edi (lekin u haqiqatan offline).
Qo'lda tozalandi:
```sql
UPDATE operator_states SET status = 'offline' WHERE user_id = '5df4ba3d-...';
```
Kelajakda bu holat bo'lmaydi chunki disconnect webhook `handleOperatorDisconnect` → 'offline' qo'yadi.

### O'zgartirilgan fayllar
- `operator-panel/src/views/MainLayout.vue` — visibilitychange + onUnmounted beacon olib tashlandi
- `operator-panel/src/stores/presence.ts` — reconnect watcher + desiredStatus
- `services/presence/src/webhooks/webhooks.controller.ts` — disconnect'da touchPresence olib tashlandi
- presence-service rebuild + restart qilindi

### Test tartibi

```bash
# 1. Operator login qiling → Avatar → "Mavjud" tanlang
# 2. Redis da presence key paydo bo'lishi kerak:
docker compose exec redis redis-cli KEYS "presence:user:*"
# 3. DevTools oching, boshqa tabga o'ting — status o'ZGARMASIN
# 4. 30 soniya kuting — hali "Mavjud" bo'lishi kerak:
docker compose exec postgres psql -U nova nova_chat -c \
  "SELECT user_id, status FROM operator_states WHERE status = 'available';"
# 5. Keyin mijoz call qilsin → operator panelda card chiqishi kerak
```

---

## 2026-06-01 — Call Signaling Fix

### Bug fix 1: GET /calls → 500 Internal Server Error

**Sabab:** `services/call/prisma/schema.prisma` da `User.phone` maydoni `String @unique` (NOT NULL)
deb e'lon qilingan edi. Admin panel orqali yaratilgan email operatorlarda `phone = NULL` bo'ladi.
Prisma runtime NULL qiymatni non-nullable fieldga moslashtirolmay `PrismaClientKnownRequestError` tashlardi.

**Tuzatildi:** `services/call/prisma/schema.prisma`
```
- phone    String     @unique
+ phone    String?    @unique
```
call-service qayta build qilindi.

---

### Bug fix 2: Call signaling — operatorga incoming call modal chiqmasdi

**Sabab (root cause):** `findAvailableOperator` funksiyasi DB da `status='available'` bo'lgan
operatorlarni topadi, lekin Redis **presence** (`presence:user:<id>` kaliti) tekshirmaydi.

Natijada:
- Eski OTP test operator `5df4ba3d` (Call Test, +998907001001) DB da `status='available'` qolib ketgan
- U haqiqatan offline — `presence:user:5df4ba3d` Redis kalit yo'q (30 daqiqa TTL o'tgan)
- ACD uni topib, `chat:user#5df4ba3d` kanaliga `call.incoming` publish qiladi
- Hech kim subscribe emas → event yo'qoladi → brauzerda modal chiqmaydi

**Tuzatildi:** `services/call/src/calls/calls.service.ts` — `findAvailableOperator`
```typescript
// Before: faqat DB status tekshirardi
// After: Redis presence ham tekshiriladi
const online = await this.redis.isOnline(c.userId);
if (!online) continue;
```
Endi faqat haqiqatan onlayn (Redis presence kaliti bor) operatorlarga call yo'naltiriladi.

---

### Bug fix 3: initiateCall — customer'ga callerToken qaytarilmaydi

**Sabab:** `POST /calls/initiate` response'da `callerToken` (LiveKit JWT) yo'q edi.
Customer LiveKit room'ga ulanolmasdi va operator javob bergach `call.connected` eventini kutishi kerak edi.

**Tuzatildi:** `services/call/src/calls/calls.service.ts` — `initiateCall`
- `callerToken` ham `ringing` ham `queued` holatlarda response'ga qo'shildi
- `livekitUrl` ham qaytariladi
- Customer endi darrov LiveKit'ga ulanib ringback tone eshitishi mumkin

---

### Yaxshilash: Centrifuge subscription token auto-refresh

**Sabab:** `operator-panel/src/stores/centrifuge.ts` da subscription yaratilganda `getToken` callback
yo'q edi. Uzoq sessiyalarda (>1 soat) yoki Centrifugo restart bo'lganda subscription token expire
bo'lsa, subscription silent fail bo'lar va `call.incoming` eventlari qabul qilinmasdi.

**Tuzatildi:** `operator-panel/src/stores/centrifuge.ts`
```typescript
// After:
const sub = client.value!.newSubscription(channel, {
  token,
  getToken: async (ctx) => {
    const res = await authApi.centrifugoSubscribeToken(ctx.channel);
    return res.token;
  },
});
```
Endi Centrifugo restart yoki token expire bo'lganda subscription avtomatik yangilanadi.

---

### Test tartibi

```bash
# 1. Operator login → setStatus available
# Browser: localhost:5173 → Login (OTP yoki email)
# Avatar menu → "Available" tanlang

# 2. Redis tekshir — operator presence bor bo'lishi kerak
docker compose exec redis redis-cli KEYS "presence:user:*"

# 3. Customer qo'ng'iroq qiladi (Flutter web: localhost:8889)
# call-service logda "call_ringing" va operator ID to'g'ri bo'lishi kerak:
docker compose logs call-service --tail=20 | grep "call_ringing\|call_queued"

# 4. Operator panelda (localhost:5173) incoming call card ko'rinishi kerak
# 5. GET /calls endi 200 qaytarishi kerak (CallQueuePanel xatosiz ishlaydi)
```

### Eslatma: stale operator_states
DB da `5df4ba3d` operatori `status='available'` bo'lib qolgan.
`isOnline` fix tufayli u endi tanlainmaydi. Agar tozalash kerak bo'lsa:
```sql
UPDATE operator_states SET status = 'offline' WHERE user_id = '5df4ba3d-944f-4f4b-9b56-3fa388b974a9';
```

---

## 2026-06-01 — Admin Panel + Regression Fix

### Qo'shilgan: Admin Panel

**Nima qo'shildi:**
- `POST /auth/email-login` — operator/admin email+parol bilan login
- `GET/POST/PATCH/DELETE /admin/users` — foydalanuvchi CRUD (admin/supervisor only)
- Traefik `dynamic.yml` ga `/api/v1/admin` → auth-service route qo'shildi
- `operator-panel/src/views/admin/AdminUsersView.vue` — users list, add modal, delete confirm
- `operator-panel/src/views/admin/AdminUserDetailView.vue` — name edit, password change tabs
- Login sahifasida "Telefon (OTP)" va "Email" tablar

**Birinchi admin yaratish:**
```bash
docker compose exec postgres psql -U nova nova_chat -c "
INSERT INTO users (id, email, password_hash, full_name, role, status, locale, metadata)
VALUES (uuid_generate_v4(), 'admin@pusher.uz', crypt('Admin12345', gen_salt('bf', 10)),
  'Super Admin', 'admin', 'active', 'uz', '{}')
ON CONFLICT (email) DO NOTHING;"
```

---

### Bug fix: Email operatorlar chat/call ishlamadi

**Sabab (root cause):**
Admin panel orqali yaratilgan operatorlarda `operator_states` jadvali yozuvi yo'q edi.
Presence-service `POST /operator/status` endpointi `operator_states` topilmasa `NotFoundException`
tashlardi va `afterLogin` da `setStatus('available').catch(()=>{})` bilan jim o'tib ketardi.
Natija: email operator Redis `operator:available` ZSET'ga kirmaydi → ACD ularni topa olmaydi →
xabar/call yo'naltirilmaydi.

**Tuzatildi:**

1. `services/presence/src/operator/operator.service.ts`
   - `updateStatus()` da `findUnique + throw NotFoundException` → `findUnique + upsert` ga o'zgartirildi
   - Endi `operator_states` yo'q bo'lsa ham, birinchi `setStatus` da avtomatik yaratiladi

2. `services/auth/src/admin/admin.service.ts`
   - `createUser()` da operator/supervisor yaratganda `operator_states` ham raw SQL orqali yaratiladi
   - `INSERT INTO operator_states ... ON CONFLICT DO NOTHING`

3. Mavjud email operatorlarga bir martalik migration (DB):
   ```sql
   INSERT INTO operator_states (user_id, status, ...)
   SELECT u.id, 'offline', ...
   FROM users u
   WHERE u.role IN ('operator','supervisor')
     AND NOT EXISTS (SELECT 1 FROM operator_states os WHERE os.user_id = u.id)
   ```
   5 ta operator uchun record yaratildi.

4. `services/auth/.dockerignore` yaratildi — Windows'da `node_modules` simlink muammosini hal qiladi

**Test natijalari:**
- OTP operator (Call Test +998907001001): login → setStatus → Redis ✅
- Email operator (vali@gmail.com): login → setStatus → Redis ✅
- ACD: customer support request → email operatorga room assign ✅
- Centrifugo `chat:user#<id>` subscription: JWT'dagi user ID to'g'ri ✅

**Kelajak uchun eslatma:**
- OTP operator'lar `operator_states` record'i OTP verify paytida yaratilmaydi — faqat
  login qilib `setStatus` chaqirganda upsert orqali yaratiladi
- Email operatorlar uchun admin.service.ts `createUser()` da avtomatik yaratiladi
- Agar yangi operatorlar ACD'dan tashqarida qolsa — `operator_states` borligini tekshir

---

## 2026-06-01 — Silent catch audit: xatolarni yashiradigan joy'lar tuzatildi

### Muammo
`setStatus('available').catch(() => {})` — xato sodir bo'lsa hech narsa chiqmasdi.
Bu sabab operator_states bug'i deyarli topilmadi. Shuning uchun barcha `catch(() => {})`
joylari tekshirildi va qasddan jim qoldirilmagan joylarga log qo'shildi.

### Tuzatildi (log qo'shildi)

| Fayl | Qator | Eski | Yangi |
|---|---|---|---|
| `stores/auth.ts` | 34 | `.catch(() => {})` | `.catch(e => console.error('[auth] setStatus failed:', e))` |
| `router/index.ts` | 66 | `.catch(() => {})` | `.catch(e => console.error('[router] loadMe failed:', e))` |
| `components/CallQueuePanel.vue` | 52 | `catch { /* silent */ }` | `catch(e) { console.error('[CallQueuePanel] loadQueue failed:', e) }` |

### Intentional (tegmaslik kerak)

Quyidagilar qasddan jim — bu to'g'ri:

| Joy | Sabab |
|---|---|
| `rooms.ts` — `new Notification()` | Browser API, user reject qilishi normal |
| `rooms.ts` — Web Audio oscillator | Optional UI sound effect |
| `rooms.ts` — `chatApi.markRead()` | Best-effort, UI'ga ta'sir qilmaydi |
| `calls.ts` — `audio.play()` | Browser autoplay policy |
| `MainLayout.vue` — `new Notification()` | Browser API |
| `auth.ts:40` — `loadMe` → `logout()` | Intentional: unauthorized = logout |
| `auth.ts:46` — `apiAuth.logout()` | Server logout fail bo'lsa ham local state tozalanadi |
| `messages.service.ts` — cursor parse | Invalid cursor = no cursor, idempotent |
| `meilisearch.ts` — createIndex/deleteDoc | "Already exists" / "Not found" — expected |
| `rooms.service.ts` — cursor parse | Xuddi shu |
| `rabbitmq.service.ts` shutdown | Cleanup, server o'chayotganda normal |
| `health.controller.ts` | Health check — `return false` etarli |
| `media.service.ts` temp cleanup | Temp fayllar, failure OK |

### Qoida (kelajak uchun)
`catch(() => {})` yoki `catch { /* silent */ }` yozish oldidan o'ylash kerak:
- **UI enhancement** (Notification, Audio, autoplay) → silent OK
- **Best-effort fire-and-forget** (markRead, analytics) → silent OK  
- **Critical flow** (login, setStatus, routing, data fetch) → **log qo'shish shart**

---

### Tekshirish tartibi (regression test)

```bash
# 1. Email login
curl -X POST http://localhost/api/v1/auth/email-login \
  -d '{"email":"admin@pusher.uz","password":"Admin12345"}'

# 2. setStatus
curl -X POST http://localhost/api/v1/operator/status \
  -H "Authorization: Bearer <token>" -d '{"status":"available"}'

# 3. Redis tekshir
docker compose exec redis redis-cli ZRANGE operator:available 0 -1

# 4. ACD test
curl -X POST http://localhost/api/v1/support/request \
  -H "Authorization: Bearer <customer_token>" -d '{}'
# → operatorId ko'rinishi kerak
```
