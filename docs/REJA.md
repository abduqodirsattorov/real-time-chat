# Nova Support Platform — Kengaytirish Rejasi

> Multi-tenancy + Nova integratsiya + Dynamic fields/actions + Tranzaksiya boshqaruvi

---

## 1. Maqsad va kontekst

Mavjud chat+call platforma transchegaraviy to'lov kompaniyasi supportи uchun
kengaytiriladi. 5+ product (ilova), har biri alohida brend. Operator har
productда alohida ishlaydi. Mijoz tranzaksiyалари Nova'дан keladi.

**Asosий tamoyil:** Maydonlар UNIVERSAL (JSONB raw saqlash) — Nova qандай
yuborса, qabul qilamiz. Admin har product uchun qaysи maydon ko'рinишини
sozlайди.

---

## 2. Multi-tenancy modeli

- **5+ product** (tenant) — har biri brend (logo, rang, nom)
- **10 operator** — UMUMIY (hammasи hamma productга javob beradi)
- Operator login → **product tanlash ekranı** → bitta product dashboard
- Bir vaqtда faqat bitta product (A ochiq → faqat A call/chat/tranzaksiya)
- Mijoz → faqat o'z productини ko'radi (brend bilan, izolyatsiya)
- Admin → operatordek, product tanlаб alohida ishlaydi

**Texnik:** `product_id` (tenant_id) hamma tegishли jadvalга qo'shilади.
Barcha query product bo'yicha filtrlanади (izolyatsiya).

---

## 3. Nova integratsiya (ma'lumот manbasi)

- **Transfer (tranzaksiya):** ~55 maydon (1-ilova.txt)
- **Profile (mijoz):** ~60 maydon
- **Bog'lanиш:** mijoz ↔ transfer = `user_id` / `uid`
- **Statuslар:** transfer maydonларида (`debit_state`, `credit_state`,
  `ext_debit_state`, `ext_credit_state`)
- **Actionlар:** Nova kodида (bazада yo'q) → Nova API "qaysи action mumkin"
  ni qaytаради, biz ko'rsатamiz

**Hozir:** API keyın ulanади. Avval struktura + namuna JSON bilan quramiz.

**Saqlash:** JSONB (raw) — har qандай format (null, son, list, object)
muammоsiz. Universal.

---

## 4. Dynamic fields & actions (admin sozlайди)

Nova ko'p maydon yuboради, lekin operatorга hammasи kerak emas. Admin har
product uchun belgилaydi:

- **Tranzaksiya ro'yxати:** qaysи ustunlар ko'rinсин (ID, user, status,
  debit, credit, servis, sana...)
- **Tranzaksiya detali:** qaysи maydonlар ko'рinसin (admin tanlaydi)
- **Filtr:** qaysи maydonlар bo'yicha filtr (sana, provider, type, status)
- **Actionlар:** Nova'дан keladi, lekin admin/rol bo'yicha cheklash mumkin

**Admin panel:** har product uchun field config UI (drag/tanlash, ko'rsат/
yashир, ko'rinиш turı: matn/sana/badge).

---

## 5. Ekranlар (operator dashboard)

### 5.1. Chat + profil (mavjud + kengaytириш)
- Chap: Inbox (mijozlar ro'yxати) — mavjud
- O'rta: chat — mavjud
- O'ng: **profil paneli** (YANGI) — faqat profil ma'lumотı (Nova profile
  maydonlари, admin tanlаган). Tranzaksiyа YO'Q.
- Profilда **"Bu mijoz tranzaksiyалари"** tugmasi → tranzaksiya bo'limига
  o'tади, shu mijoz (user_id) avtomatik filtrlanган

### 5.2. Tranzaksiya bo'limi (YANGI, alohida page)
- Chap nav'да yangi **tranzaksiya iconı** (dumaloq)
- Bosилsa: chat+profil yopilади, tranzaksiya bo'limı ochiladi
- **Ro'yxат:** Nova jadval ko'rinишı (ID, user, identifikatsiyа, ext_id,
  debit/credit status badge, servis, debit/credit summa, sana, ko'rish/
  tahrir icon)
- **Qidiruv:** telefon raqам bo'yicha
- **Filtr:** sana (дан/гача), provider, type, status (debit/credit) + h.k.
- Chatдан kelса — mijoz avtomatik filtrlanган

### 5.3. Tranzaksiya detali (YANGI)
- Bitta tranzaksiyага bosилsa → detal
- Maydon-qiymат juftlари (admin tanlаган muhимlар yuqorida)
- "Barcha maydonlар" yig'илган (collapsible) — operator kerak bo'лsa ochadi
- **Actionlар menu** (Nova'дан "qaysи mumkin"): Recredit, Pulni qaytариш,
  Status qayta olish, Xabar yuborish... (holatга qarab faol/nofaol)

---

## 6. Bosqichlı reja (AI'ga ketма-ket)

> Har bosqичдан keyin BRAUZERда sinаш + git commit. Regressiya oldини olиш.

### 0-BOSQICH: Multi-tenancy poydevorı
- `products` jadval (id, name, slug, branding JSONB, settings JSONB)
- `product_id` hamma tegishли jadvalга (rooms, customers, calls, messages)
- Migration: mavjud data → default product
- Operator login → product tanlash ekranı
- Call/chat routing product bo'yicha izolyatsiya
- Mijoz tomon: product brendı (logo, rang, nom)
- **Test:** 2 product yarat, operator A tanlаydi → faqat A ko'radi; chat/
  call A ichида; mijoz A brendини ko'radi

### 1-BOSQICH: Mijoz profil paneli (Nova profile)
- `customers` jadval kengaytириш: product_id, external_uid (Nova user_id),
  profile_data JSONB (raw Nova profile), notes, tags
- API: GET/PATCH /customers, upsert by external_uid
- Operator panel: chat o'ngida profil paneli (admin tanlаган maydonlар)
- **Test:** profil ko'rinади, izoh/teg saqlanади

### 2-BOSQICH: Tranzaksiya bo'limi + qidiruv + filtr
- `transactions` jadval: product_id, external_id, user_uid, data JSONB
  (raw Nova transfer), indexed (user_uid, status, created_at, provider)
- API: GET /transactions (filtr, qidiruv, pagination), GET /transactions/:id
- Operator panel: tranzaksiya icon → alohida page (Nova jadval ko'rinиш)
- Qidiruv (telefon), filtr (sana, provider, type, status)
- Chatдан "bu mijoz tranzaksiyалари" → avtomatik filtr
- **Test:** ro'yxат, qidiruv, filtr, chatдан o'tиш

### 3-BOSQICH: Tranzaksiya detali + actionlар
- Detal sahifa (admin tanlаган maydon + collapsible barcha)
- Actionlар menu (Nova API "qaysи mumkin" — hozir namuna/stub)
- **Test:** detal ko'rinади, action menu (stub) ishlaydi

### 4-BOSQICH: Admin field/action config
- Admin panel: har product uchun field config (qaysи maydon ko'rinсин:
  ro'yxат, detal, filtr)
- Action config (rol bo'yicha cheklаш)
- **Test:** admin maydon yashirади → operatorда o'zgаради

### 5-BOSQICH: Nova API real integratsiya (keyın)
- Webhook/API: Nova → transfer/profile ma'lumот qabul (real)
- Action API: Nova'га action yuboriш
- Statuslар real
- **Test:** real Nova data oqиб keladi

---

## 7. Muhим texnik eslatmalар

- **Universal JSONB:** har maydon raw saqlanади — format muammо emas
- **Multi-tenancy:** product_id HAMMA query'да (izolyatsiya buzилmasligи
  shart — fintech!)
- **Mavjud funksiyа:** chat/call BUZILMASLIGI kerak (har bosqич test)
- **UI uslubı:** mavjud dizayn (rang #3B6FF5, oq karta) SAQLANADI
- **Bog'lanиш:** mijoz ↔ tranzaksiya = user_id/uid
- **Actionlар:** Nova manbаси (biz ko'rsатamiz, bajarมaymiz logikani)
- **Maxfiylik:** karta/passport ma'lumотı himoyа, audit log

---

## 8. Ochiq savollар (keyın aniqlашади)

- Action'lar aniq ro'yxати va rol matritsasi (kim qaysı action)
- Nova API endpoint'lари (real integratsiya bosqичида)
- Real transfer/profile JSON namunаси (maydon turlari aniqlаш)
- Statuslар to'liq ro'yxати (WAIT, OK, va boshqalар)
- Audit/recording talablari (fintech compliance)
