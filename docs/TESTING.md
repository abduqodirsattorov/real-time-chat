# Nova Chat & Call Platform — Testing Guide

## Tez ishga tushirish

```powershell
# Barcha integration testlar (services running bo'lishi kerak)
cd C:\Users\abduq\OneDrive\Documents\real-time-chat
.\tests\run-tests.ps1

# Faqat regressiya testlari (operator + multi-tenancy + transactions)
.\tests\run-tests.ps1 -Suite regression   # paket ichida: npm run test:regression

# Bitta suite
.\tests\run-tests.ps1 -Suite operator
.\tests\run-tests.ps1 -Suite multitenancy
.\tests\run-tests.ps1 -Suite transactions
.\tests\run-tests.ps1 -Suite auth
.\tests\run-tests.ps1 -Suite chat
.\tests\run-tests.ps1 -Suite call
```

## Talab

| Talab | Qanday tekshirish |
|---|---|
| Docker services ishlaydi | `docker compose ps` |
| admin@pusher.uz mavjud | `curl http://localhost/api/v1/auth/email-login -d '{"email":"admin@pusher.uz","password":"Admin12345"}'` |
| DB migratsiyalar | `transactions`, `customers`, `products` jadvallari mavjud |
| Node.js 18+ | `node --version` |

### Admin foydalanuvchi yo'q bo'lsa:
```powershell
docker compose exec postgres psql -U nova nova_chat -c "INSERT INTO users (id,email,password_hash,full_name,role,status,locale,metadata) VALUES (uuid_generate_v4(),'admin@pusher.uz',crypt('Admin12345',gen_salt('bf',10)),'Super Admin','admin','active','uz','{}') ON CONFLICT (email) DO NOTHING;"
```

---

## Test suitlari

### `operator.test.ts` — Operator regressiya testlari

| Test | Nima tekshiradi | Qaysi bug |
|---|---|---|
| Email login | admin email+parol bilan tizimga kirish | — |
| Wrong password → 401 | Noto'g'ri parol rad etiladi | — |
| setStatus available → 200 | operator_states upsert ishlaydi | operator_states yo'q edi (admin yaratgan) |
| getStatus after set → available | Status saqlanadi | — |
| Status flapping (3s) | 3 soniyadan keyin hali available | visibility/unmount beacon bug |
| PATCH /operator/product | Default UUID qabul qilinadi | IsUUID rejecting 000...002 |
| GET /calls → 200 | Call list 500 bermaydi | NULL phone field crash |

### `multitenancy.test.ts` — Product izolyatsiya (FINTECH CRITICAL)

| Test | Nima tekshiradi | Qaysi bug |
|---|---|---|
| GET /products → array | Products API ishlaydi | — |
| Default product mavjud | 00000...002 listda bor | — |
| Rooms product izolyatsiya | A productda B product room ko'rinmaydi | product_id filter |
| Calls product izolyatsiya | A productda B product call ko'rinmaydi | call product_id = NULL |
| Create + soft delete product | Admin CRUD ishlaydi | — |
| Yangi product room = bo'sh | Yangi productda boshqa data yo'q | — |

### `transactions.test.ts` — Tranzaksiyalar

| Test | Nima tekshiradi | Qaysi bug |
|---|---|---|
| Upsert yaratish | JSONB data saqlanadi | — |
| Upsert ikkinchi marta | Duplicate yaratilmaydi | — |
| Universal JSONB (null/number/array/object) | Har format qabul qilinadi | — |
| List + pagination | 20 ta/sahifa, sahifalar boshqacha | — |
| Search by phone | data->>'phone' qidiruv | Debounce bug (avtomatik qidiruv) |
| Search by external_id | external_id ILIKE qidiruv | — |
| Provider filtr | Provider bo'yicha filtr | — |
| Sana range filtr | fromDate/toDate ishlaydi | — |
| debitState filtr | Case-insensitive ishlaydi | — |
| GET /transactions/:id | Bitta tranzaksiya detalı | — |
| **Product isolation** | A product TX B product operator ko'ra olmaydi | **FINTECH CRITICAL** |
| GET /rooms/search-user | Tx detalida chat link ishlaydi | Chat link bug |

### `auth.test.ts` — Auth (mavjud)

OTP send/verify, JWT, token rotation, Nova SSO.

### `chat.test.ts` — Chat (mavjud)

Support room, messages, typing, read receipt, media presign.

### `call.test.ts` — Call (mavjud)

Call initiate, history, hangup, outbound role check.

---

## To'g'ridan-to'g'ri Jest (integration dir ichidan)

```powershell
cd C:\Users\abduq\OneDrive\Documents\real-time-chat\tests\integration

# Hammasi
npm test

# Faqat regressiya
npm run test:regression

# Bitta fayl
npm run test:operator
npm run test:multitenancy
npm run test:transactions

# Verbose
npx jest operator.test.ts --testTimeout=30000 --forceExit --verbose
```

---

## Unit testlar (har servis ichida)

```powershell
# auth-service unit tests (mock bilan, servis shart emas)
cd C:\Users\abduq\OneDrive\Documents\real-time-chat\services\auth
npx jest --passWithNoTests

# chat-service
cd ..\chat && npx jest --passWithNoTests

# presence-service
cd ..\presence && npx jest --passWithNoTests
```

Unit testlar mock ishlatadi — servis ishlamasa ham ishlaydi.
Integration testlar haqiqiy servisga HTTP so'rov yuboradi.

---

## Regressiya qoidasi

**Yangi bug topilyapti → yangi test qo'sh → commit.**

Tartib:
1. Bug topildi → `tests/integration/` da tegishli faylga test qo'sh
2. Test FAIL bo'lishi kerak (bug hali tuzatilmagan)
3. Bug tuzatildi → test PASS bo'lishi kerak
4. Commit: `test(regression): <bug nomi>`
5. Keyingi safar `npm test` → bu bug qaytmaydi

---

## CI uchun (kelajakda)

```yaml
# GitHub Actions / GitLab CI
- name: Run integration tests
  run: |
    cd tests/integration
    npm ci
    BASE_URL=http://localhost:80/api/v1 npm test
  env:
    BASE_URL: ${{ env.BASE_URL }}
```

Services `docker-compose.test.yml` bilan ko'tarilgandan keyin ishlatiladi.

---

## Muammo hal qilish

| Muammo | Yechim |
|---|---|
| `Admin login failed 401` | Admin foydalanuvchi yaratilmagan — yuqoridagi SQL buyrug'ini bajaring |
| `Invalid OTP from Redis` | auth-service ishlamayapti yoki Redis yo'q |
| `Cannot reach http://localhost:80` | `docker compose up -d` |
| `ECONNREFUSED` | Services ishlamayapti |
| `Cannot find module './setup'` | `npm install` (tests/integration ichida) |
| Test hang qoladi | `--forceExit` flag qo'shilgan — 30s timeout kutadi |
