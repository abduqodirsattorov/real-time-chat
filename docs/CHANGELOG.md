# CHANGELOG

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
