# CHANGELOG

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
