# Nova API Integratsiya Spetsifikatsiyasi

> Real tranzaksiyalar bilan ishlash. Xavfsizlik BIRINCHI o'rinda.
> Bu hujjat — Nova jamoasi bilan kelishish uchun. Siz shakllantirasiz,
> kerakli joylarni to'ldirasiz/o'zgartirasiz.

---

## 1. Umumiy arxitektura

Ikki yo'nalishli, uzilishga chidamli:

```
┌─────────────┐                          ┌─────────────┐
│   NOVA      │   1. Webhook (push)      │  Support    │
│   (manba)   │ ───────────────────────> │  Platform   │
│             │   yangi tranzaksiya/     │  (biz)      │
│             │   status o'zgarishi      │             │
│             │                          │             │
│             │   2. On-demand (pull)    │             │
│             │ <─────────────────────── │             │
│             │   operator so'raganda    │             │
│             │   profil/tranzaksiya     │             │
│             │                          │             │
│             │   3. Action (pull)       │             │
│             │ <─────────────────────── │             │
│             │   Recredit, refund...    │             │
└─────────────┘                          └─────────────┘
```

**Uzilishga qarshi:**
- Kesh: Nova'dan olingan ma'lumot JSONB saqlanadi (Nova ishlamasa — eski ko'rinadi)
- Webhook queue (RabbitMQ): Nova push qilsa — navbatga, yo'qolmaydi
- Retry: pull so'rov muvaffaqiyatsiz → 3 marta qayta urinish (exponential backoff)
- Graceful degradation: Nova o'lsa — chat/call ishlayveradi

---

## 2. XAVFSIZLIK (eng muhim — real pul)

### 2.1. Autentifikatsiya — ikki tomonlama

**A) Biz → Nova (pull, action):**
- **mTLS (mutual TLS)** — eng kuchli. Ikkala tomon sertifikat bilan tasdiqlanadi. YOKI:
- **API key + IP whitelist:** bizning server IP'si Nova'da oq ro'yxatda + maxfiy API key (header: `X-API-Key`)
- **Qo'shimcha: HMAC imzo** — har so'rov tanasi maxfiy kalit bilan imzolanadi (`X-Signature: HMAC-SHA256(body, secret)`). Nova tekshiradi.
- Token: qisqa muddatli (OAuth2 client_credentials yoki JWT, 15 daqiqa), avtomatik yangilanadi

**B) Nova → biz (webhook):**
- **HMAC imzo (MAJBURIY):** Nova har webhook'ni maxfiy kalit bilan imzolaydi (`X-Nova-Signature`). Biz tekshiramiz — imzo noto'g'ri bo'lsa, RAD ETAMIZ. Bu — "boshqa birov ushlab olmasin" talabingizning kaliti.
- **IP whitelist:** faqat Nova server IP'sidan webhook qabul qilamiz
- **Timestamp:** har webhook'da vaqt (`X-Nova-Timestamp`) — 5 daqiqadan eski bo'lsa rad (replay attack oldini olish)
- **Idempotency:** har webhook'da unique ID — takror kelsa, bir marta qayta ishlanadi

### 2.2. Transport
- **FAQAT HTTPS/TLS 1.2+** — hech qachon HTTP
- mTLS afzal (ikki tomonlama sertifikat)

### 2.3. Maxfiy ma'lumot
- Karta raqami, passport: maskalangan saqlanadi (`6262****2001`) yoki shifrlangan
- To'liq karta raqami — agar kerak bo'lsa, shifrlash (AES-256) yoki saqlamaslik
- Loglarda maxfiy ma'lumot YO'Q (karta, passport masklanadi)

### 2.4. Avtorizatsiya (action — eng xavfli)
- **Rol asosida:** qaysi rol (admin/operator/supervisor) qaysi action qila oladi
- **Audit log:** HAR action — kim, qachon, qaysi tranzaksiya, natija (o'zgartirib bo'lmaydigan log)
- **Nova tomonda ham tekshirish:** biz so'rov yuborsak ham, Nova rolni qayta tekshiradi (ikki qatlam)
- **Sezgir action'lar (refund, recredit):** qo'shimcha tasdiq (2-qadam) yoki supervisor ruxsati

### 2.5. Rate limiting
- Action API: cheklangan (masalan, 10/daqiqa har operator) — suiiste'mol oldini
- Webhook: Nova IP'dan oqim cheklangan

### 2.6. Secrets boshqaruvi
- API key, HMAC secret, sertifikatlar: env o'zgaruvchi yoki secrets manager (HAR JOYDA `change_me` ALMASHTIRILADI)
- Kalitlar muntazam yangilanadi (rotation)
- Git'ga HECH QACHON secret commit qilinmaydi

---

## 3. KERAKLI API'lar (Nova tomonda bo'lishi kerak)

> Pastdagilar — biz Nova'dan kutadigan endpoint'lar. Siz Nova jamoasi bilan
> aniq URL, format, auth'ni kelishasiz. Format namuna — o'zgartirsangiz bo'ladi.

### 3.1. Profil olish (pull — operator so'raganda)
```
GET {NOVA_BASE}/api/support/profile/{user_uid}
Auth: X-API-Key + X-Signature (HMAC)
Javob: 200 → to'liq profil JSON (1-ilova profile maydonlari)
       404 → mijoz topilmadi
       401/403 → auth xato
```

### 3.2. Mijoz tranzaksiyalari (pull)
```
GET {NOVA_BASE}/api/support/transactions?user_uid={uid}&page=1&limit=20
    &date_from=...&date_to=...&provider=...&type=...&status=...
Auth: X-API-Key + X-Signature
Javob: 200 → { items: [transfer JSON...], total, page }
```

### 3.3. Bitta tranzaksiya (pull)
```
GET {NOVA_BASE}/api/support/transaction/{ext_id}
Auth: X-API-Key + X-Signature
Javob: 200 → to'liq transfer JSON (1-ilova transfer ~55 maydon)
```

### 3.4. Qaysi action mumkin (pull — tranzaksiya statusiga qarab)
```
GET {NOVA_BASE}/api/support/transaction/{ext_id}/actions
Auth: X-API-Key + X-Signature
Javob: 200 → { actions: [
   { key: "recredit_p2p", label: "Recredit (P2P)", enabled: true },
   { key: "refund_cash", label: "Pulni qaytarish (CASH)", enabled: false,
     reason: "Status mos emas" },
   ...
] }
```
> Bu MUHIM: action'lar holatga qarab faol/nofaol (siz 5-rasmda ko'rsatgan).
> Nova qaysi action mumkinligini aytadi, biz ko'rsatamiz.

### 3.5. Action bajarish (pull — eng xavfli)
```
POST {NOVA_BASE}/api/support/transaction/{ext_id}/action
Auth: X-API-Key + X-Signature + Idempotency-Key
Tana: {
   action: "recredit_p2p",
   operator_id: "...",   // kim bajaryapti (audit)
   params: {...}         // action'ga xos (masalan yangi karta)
}
Javob: 200 → { success: true, result: {...} }
       403 → ruxsat yo'q
       409 → action mumkin emas (status mos emas)
       422 → params xato
```
> Idempotency-Key: takror yuborilsa, bir marta bajariladi (pul ikki marta
> qaytarilmasin!)

### 3.6. Webhook (push — Nova → biz)
Nova quyidagi hodisalarda bizga yuboradi:
```
POST {SUPPORT_BASE}/api/v1/nova/webhook
Headers: X-Nova-Signature (HMAC), X-Nova-Timestamp, X-Nova-Event-Id
Tana: {
   event: "transaction.created" | "transaction.updated" | "status.changed",
   ext_id: "...",
   user_uid: "...",
   data: { ...to'liq transfer JSON... },
   timestamp: "..."
}
Biz: imzo tekshiramiz → queue (RabbitMQ) → saqlaymiz → operatorga real-time
Javob: 200 (qabul qilindi) tez qaytariladi
```

---

## 4. ACTION RO'YXATI (siz bergan, rol bilan)

> Har action uchun: kim qila oladi (rol), Nova endpoint, params.
> Bu jadval — kelishish uchun. To'ldiring/o'zgartiring.

| Action | Key | Rol | Params |
|--------|-----|-----|--------|
| Statuslarni unireddan qayta olish | refresh_status | operator+ | — |
| Xabar yuborish | send_message | operator+ | text |
| Recredit (P2P) | recredit_p2p | operator+ | — |
| Recredit (Payment) | recredit_payment | operator+ | — |
| Recredit (Yangi Uzcard) | recredit_uzcard | operator+ | card |
| Qabul qiluvchi o'zgartirish (CASH) | edit_receiver_cash | supervisor+ | receiver |
| Pulni qaytarish (CASH) | refund_cash | supervisor+ | sabab |
| Paynetni transferga | paynet_to_transfer | operator+ | — |
| Recredit (Visa) | recredit_visa | operator+ | — |
| Keshbek berish | give_cashback | supervisor+ | summa |
| Export CSV | export_csv | operator+ | — |
| P2p ma'lumot yuklash | download_p2p | operator+ | — |
| Central Bank Report | cb_report | admin | — |

Bulk (belgilangan ko'p tranzaksiya):
- Statuslarni qayta olish, Debit/Kredit status yangilash, Xabar, 
  Recredit (P2P/Payment), Confirm

> Sezgir action'lar (refund, edit_receiver, cashback) — supervisor+ va 
> qo'shimcha tasdiq.

---

## 5. BIZNING TOMONDA QILINADIGAN ISH (integratsiya bosqichi)

1. Nova API client (servis): pull so'rovlar, auth (key+HMAC), retry, kesh
2. Webhook qabul qiluvchi: imzo tekshirish, queue, saqlash
3. Tranzaksiya/profil: Nova'dan kelgan JSONB saqlash (universal — tayyor)
4. Action: rol tekshirish, Nova'ga yuborish, audit log, idempotency
5. Real-time: webhook → Centrifugo → operator panel yangilanadi
6. Xavfsizlik: barcha yuqoridagi talablar
7. Test: integratsiya testlari (mock Nova bilan)

---

## 6. SIZDAN KERAK (Nova jamoasidan)

To'ldiring:
- [ ] Nova base URL (test + production)
- [ ] Auth usuli: mTLS / API key+HMAC / OAuth2 — qaysi?
- [ ] HMAC secret (xavfsiz uzatiladi, git'ga emas)
- [ ] Bizning server IP (Nova whitelist uchun) — deploy'dan keyin
- [ ] Webhook: Nova push qila oladimi? Qaysi hodisalar?
- [ ] Real transfer JSON namunasi (1 ta to'liq, maxfiy maskalangan)
- [ ] Real profil JSON namunasi
- [ ] Action endpoint'lar aniq (har action URL/format)
- [ ] "Qaysi action mumkin" — Nova qanday aytadi?
- [ ] Rate limit Nova tomonda bormi?
- [ ] Statuslar to'liq ro'yxati (OK, WAIT, Pending, Fail, Err, Cancel...)

---

## 7. BOSQICHMA-BOSQICH (integratsiya rejasi)

> Har bosqich + test, regressiya yo'q (npm test).

1. **Auth poydevori:** Nova API client + auth (key+HMAC) + retry + test 
   (mock Nova)
2. **Pull (profil/tranzaksiya):** operator so'raganda Nova'dan olish + kesh
3. **Webhook:** qabul + imzo tekshirish + queue + saqlash + real-time
4. **Actions:** rol + Nova'ga yuborish + audit log + idempotency
5. **Xavfsizlik audit:** barcha talablar tekshiriladi
6. **Production secrets:** change_me almashtirish, deploy

---

## ESLATMA — XAVFSIZLIK QOIDALARI (qisqa)

1. HTTPS faqat, mTLS afzal
2. HMAC imzo HAR so'rov/webhook'da (ikki tomonlama)
3. IP whitelist (Nova + biz)
4. Timestamp + idempotency (replay/takror oldini)
5. Rol + audit log (har action)
6. Maxfiy ma'lumot masklanadi (karta, passport)
7. Secrets git'ga emas, rotation
8. Rate limit (action)
9. Nova tomonda ham qayta tekshirish (ikki qatlam)
10. Graceful degradation (Nova o'lsa, tizim yiqilmaydi)
