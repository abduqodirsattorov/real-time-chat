# Xavfsizlik Auditi — Global Post-Mortem va Tizimli Xulosa

**Sana:** 2026-09-10  
**Loyiha:** Nova Chat & Call Platform (real-time-chat)  
**Holat:** Qabul qilindi va arxitekturaga kiritildi  

---

## 1. Kirish va Muammo Tavsifi

2026-yil sentyabr oyidagi xavfsizlik tekshiruvi natijasida tizimda 23 ta kamchilik (shundan 14 tasi P0 darajasidagi to'g'ridan-to'g'ri ekspluatatsiya qilinishi mumkin bo'lgan zaifliklar) aniqlandi. 

Garchi oldingi relizlarda (`9174b80`, `e545d5c`) xavfsizlik bo'yicha qator ishlar qilingan va `docs/STATUS.md` da tizim to'liq himoyalangan deb qayd etilgan bo'lsa-da, haqiqatda jiddiy teshiklar (cross-tenant audio eshitish, default dev-secretlar, ochiq Traefik/Centrifugo portlari, soxtalashtiriladigan SSO imzosi) ochiq qolgan.

---

## 2. Nima uchun o'tgan safar bu kamchiliklar qolib ketgan edi? (5 ta Ildiz Sabab)

### Sabab 1: "Siloed / Mahalliy Tuzatish" (Local Patching vs Whole-System Awareness)
* Oldingi bosqichda Cross-Tenant PII sizishi muammosi ko'tarilganda, dasturchi faqat `services/chat/src/common/product-access.ts` ni yaratgan va faqat `chat-service` ning 4 ta kontrolleriga (`customers`, `transactions`, `tags`, `field-configs`) ulagan.
* Xuddi shu multi-tenancy talabi `call-service` (LiveKit tokenlari, qo'ng'iroqlar navbati), `media-service` (fayllar va rasmlar) va `presence-service` ga tarqatilmagan. Natijada "chatda izolyatsiya bor, qo'ng'iroq va fayllarda esa yo'q" holati yuzaga kelgan.

### Sabab 2: "Happy-Path" Testlar Tuzog'i va Yolg'on Ishonch (Illusion of Safety)
* Yozilgan integratsion testlar asosan tizim to'g'ri ishlashini (foydalanuvchi o'z ma'lumotlarini so'raganda 200 qaytishi) tekshirgan.
* "Begona tenant operatori qo'ng'iroqqa kirsa 403 beradimi?", "Oddiy mijoz `mute` yoki `transfer` chaqirsa nima bo'ladi?", "SSO'da rol soxtalashtirilsa bloklanadimi?" degan salbiy (adversarial/negative) testlar kiritilmagan. Testlar 100% yashil o'tgani uchun muammo yo'q deb hisoblangan.

### Sabab 3: Mikroservislar Duplikatsiyasi (Copy-Paste Drift)
* Loyihadagi 8 ta mikroservis har biri alohida `jwt.strategy.ts`, `prisma.service.ts`, `account-status.ts` kod nusxalariga ega.
* Bir servisda qilingan tuzatish (masalan, `chat-service` dagi `assertProductAccess`) qolgan 7 ta servisga tushmagan. Yagona umumiy modullar paketi bo'lmagani arxitekturaning tezda sinishiga (drift) olib kelgan.

### Sabab 4: Qulaylik uchun qoldirilgan Dev-Fallbacklar (Convenience over Security)
* Kod yozish va lokal muhitda tez sinab ko'rish maqsadida `JWT_SECRET ?? 'dev_secret'`, `INTERNAL_SERVICE_KEY ?? 'internal_service_default_secret_key'`, Centrifugoda `admin_password: "admin"`, webhookda `if (!this.secret) return true` kabi osonlashtiruvchi kodlar yozilgan.
* Keyinchalik bu kodlar production holatiga tekshirilmasdan qolib ketgan.

### Sabab 5: Hujjatlashtirish va Kod orasidagi Tafovut (Documentation Drift)
* `docs/STATUS.md` hujjatiga kod to'liq yozib bo'linmasdan, rejalashtirilgan ishlar "bajarildi ✅" deb kiritilgan. Bu esa keyingi tekshiruvchilarni chalg'itgan.

---

## 3. Kelgusida Qaytarilmasligi Uchun Majburiy Qoidalar (Institutionalized Rules)

1. **Fail-Closed Secrets:** Hech qachon fallback sifatida `dev_secret` yoki default parollar qoldirilmaydi. Muhit o'zgaruvchisi bo'lmasa, servis yuklanishda darhol to'xtaydi (`process.exit(1)` / startup throw).
2. **Absolute Zero-Trust for Operators:** Operator roli hech qachon tenant tekshiruvini chetlab o'tishga (`if (isStaff) return`) asos bo'lolmaydi. Har bir `getCall`, `getLivekitToken`, `verifyAttachmentAccess` va `assertMember` da `assertProductAccess` chaqiriladi.
3. **Default-Deny Everywhere:** Webhook va WebSocket obunalarida aniq ro'yxatda bo'lmagan har qanday kanal qat'iy rad etiladi (`code 1000`).
4. **Mandatory Negative Test Matrix:** Har bir yangi xususiyat uchun ijobiy testdan oldin 4 ta salbiy test (boshqa tenant, ruxsatsiz rol, soxta imzo, expired token) yozilishi shart.
5. **Claims Tied to Passing Tests:** `STATUS.md` ga yozilgan har bir jumla aniq, mavjud bo'lgan va o'tuvchi test nomi bilan bog'lanishi shart.

---

## 4. Ikkinchi Bosqich Audit Tahlili (Senior Enterprise / Fintech Feedback)

Ikkinchi auditda tizimning 319 ta testi yashil bo'lishiga qaramay, haqiqiy production va fintech muhitiga tayyor emasligi ko'rsatildi:

### 1. Media Fayllari Anonim Ochiqligi (`nova-media` bucket)
* **Xato:** `docker-compose.yml` da `mc anonymous set download local/nova-media` komandasi orqali butun bucket ommaviy qilingan.
* **Xavf:** `media-service` da qilingan barcha `verifyAttachmentAccess` va `assertProductAccess` tekshiruvlari foydasiz bo'lib qoladi, chunki tajovuzkor to'g'ridan-to'g'ri MinIO S3 porti (9000) orqali fayl UUID sini bilgan holda istalgan mijoz pasporti, cheki yoki shaxsiy suratini ruxsatsiz yuklab olardi.
* **Tuzatish:** `docker-compose.yml` da `mc anonymous set none local/nova-media` va `nova-recordings` ga o'zgartirildi va jonli konteynerga qo'llandi. Fayllarga faqat 15 daqiqalik signed URL orqali kirish ta'minlandi.

### 2. LiveKit Recording Webhook Fail-Open
* **Xato:** `webhooks.controller.ts` da `catch (err)` bloki ichida xato bo'lsa ham `continue` qilib, ogohlantirish berish bilan cheklangan.
* **Xavf:** Tajovuzkor LiveKit portiga soxta `egress_ended` yoki `failed` hodisalarini yuborib, mijoz qo'ng'iroqlari yozuvlarini asossiz to'xtatishi yoki soxta fayllarni DB ga ulab qo'yishi mumkin edi.
* **Tuzatish:** Catch bloki butunlay olib tashlandi, raw body mavjudligi va imzo to'g'riligi majburiy qilindi. Imzo xato bo'lsa, so'rov darhol `401 Unauthorized` bilan to'xtatiladi.

### 3. Nova Tranzaksiya Amalida Operatorni Soxtalashtirish
* **Xato:** `nova.controller.ts` da `operatorId: body.operatorId ?? user.sub` qabul qilingan.
* **Xavf:** Operator yoki supervisor request body'ga boshqa xodimning ID'sini yozib, begona nomdan pul qaytarish (`refund`), tranzaksiyani bekor qilish (`cancel`) yoki firibgarlik belgisini qo'yishi (`flag_fraud`) mumkin edi. Audit trail buzilib, haqiqiy aybdorni aniqlash imkonsiz bo'lardi.
* **Tuzatish:** Body'dan `operatorId` butunlay olib tashlandi. Ijrochi FAQAT va FAQAT tekshirilgan JWT token (`req.user.sub`) orqali olinadi. Qat'iy `ExecuteNovaActionDto` (allowlist: `recredit`, `refund`, `cancel`, `resend_receipt`, va h.k.) va min-length reason code majburiy qilindi.

### 4. Rate Limiting IP Spoofing (`X-Forwarded-For`)
* **Xato:** `http-hardening.ts` da `req.headers['x-forwarded-for']` ning birinchi elementi to'g'ridan-to'g'ri olingan.
* **Xavf:** Hujumchi har bir HTTP so'rovda `X-Forwarded-For: 1.2.3.4`, `5.6.7.8` deb yangi IP yuborib, rate limitni chetlab o'tib, servislarni DoS qilishi mumkin edi.
* **Tuzatish:** Barcha 8 ta mikroservisda `expressApp.set('trust proxy', 1)` o'rnatildi va IP faqat `req.ip` orqali olinadigan qilindi.

### 5. Log Redaction & PII Xavfsizligi
* **Xato:** Mikroservislarda so'rov sarlavhalari va ma'lumotlar filtrsiz logga yozilishi oqibatida `Authorization: Bearer <jwt>`, cookie va maxfiy kalitlar log fayllarga tushishi mumkin edi.
* **Tuzatish:** Barcha 8 ta mikroservisning `LoggerModule.forRoot` konfiguratsiyasiga `redact` qoidalari qo'shilib, maxfiy ma'lumotlar avtomatik `[REDACTED]` holatiga keltirildi.

---

## 5. O'zbekiston Fintech Regulyatsiyasi va PCI-DSS Talablari Bo'yicha Xatarlar

Agar ushbu kamchiliklar bartaraf etilmasdan productionga chiqarilganda:
1. **O'zbekiston Markaziy Bankining 3759-sonli "To'lov tashkilotlari va operatorlari axborot xavfsizligini ta'minlash to'g'risida"gi Nizomi:**
   - Ushbu nizom to'lov ma'lumotlari, mijozlarning shaxsiy identifikatsiya ma'lumotlari (PII) va tranzaksiyalar yaxlitligini qat'iy talab qiladi. Ochiq S3 bucket yoki soxtalashtiriladigan operator ID holati aniqlansa, to'lov litsenziyasi to'xtatiladi yoki bekor qilinadi.
2. **PCI-DSS 4.0 (Payment Card Industry Data Security Standard):**
   - 3-talab (Karta ma'lumotlarini himoya qilish) va 10-talab (Barcha tarmoq va ma'lumotlarga kirishlarni audit qilish va o'zgartirib bo'lmasligini ta'minlash). Operator ID ni body'dan olish auditning o'zgartirilmaslik (non-repudiation) tamoyilini to'g'ridan-to'g'ri buzadi.
3. **Jinoyat Kodeksi va Moliyaviy Yo'qotishlar:**
   - Xodimlar o'rtasida noqonuniy mablag'larni o'zlashtirish sodir bo'lganda, tizim audit loglari sud yoki ichki xavfsizlik tomonidan dalil sifatida qabul qilinmasdi.

---

## 6. Muhandislik Isboti (Verification Evidence)

Barcha o'zgarishlar kiritilgandan so'ng:
* **Integratsion testlar:** `npm --prefix tests/integration test` — **165/165 passed** (9 test suite)
* **Unit testlar:** Barcha 8 ta mikroservis — **154/154 passed**
* **Jami:** **319/319 passed (100% yashil)**
* **MinIO Konfiguratsiyasi:** `nova-media` va `nova-recordings` bucketlari `private` holatga o'tkazildi.
* **Docker Holati:** Barcha 8 ta mikroservis va yordamchi konteynerlar sog'lom (healthy) holatda ishlamoqda.

