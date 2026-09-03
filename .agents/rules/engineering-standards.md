# Global Engineering Standards & Security Architecture Rules

Ushbu qoidalar har qanday dasturiy ta'minot (ayniqsa, fintech, real-time aloqa va ko'p ijarachili tizimlar) arxitekturasi, xavfsizligi va sifatini kafolatlash uchun majburiy hisoblanadi.

---

## 1. Single-Path of Authorization (Yagona Avtorizatsiya Yo'li) Qoidasi
* **Muammo:** Bitta resursga (masalan WebSocket channel yoki file) ulanish uchun ikkita mustaqil yo'l (Token generator va Proxy Webhook) mavjud bo'lganda, ulardan biri zaif bo'lsa butun tizim xavfsizligi buziladi.
* **Qat'iy Qoida:** 
  1. Har qanday himoyalangan resursga kirish faqat bitta markaziy avtorizatsiya mexanizmi orqali amalga oshirilishi kerak.
  2. Agar token generatsiyasi saqlab qolinsa, u backend tekshiruvlari (xona a'zoligi, product izolyatsiyasi, RBAC rollari) bilan 100% bir xil qat'iylikda tekshirilishi shart.
  3. "Token bo'lsa bo'ldi" qabilidagi tekshiruvsiz imzolash (blind signing) qat'iyan man etiladi.

---

## 2. Schema-Migration Invariance (Schema va Baza Muvozanati) Qoidasi
* **Muammo:** ORM (Prisma/TypeORM/Hibernate) schemasi o'zgartirilib, bazadagi jadvallar yangilanmasa (yoki teskarisi), build muvaffaqiyatli o'tadi, lekin production runtime'da 500 xatolar portlaydi.
* **Qat'iy Qoida:**
  1. `schema.prisma` dagi har bir o'zgarish (ustun, enum, jadval) darhol versiyalangan SQL migratsiya fayli (`migrations/*.sql`) bilan mustahkamlanadi.
  2. CI/CD pipeline'da `prisma migrate diff --from-schema-datamodel --to-url "$DATABASE_URL" --exit-code` buyrug'i ishga tushirilishi va schema drift bo'lsa build to'xtatilishi shart.
  3. Bazada mavjud bo'lmagan ustunlarni ORM modelida qoldirish yoki bazadagi ustunlarni ORM dan yashirish taqiqlanadi.

---

## 3. Fail-Safe Boundary Validation & Zero-500 Qoidasi
* **Muammo:** Webhook, WebSocket yoki tashqi API'lardan kelgan noto'g'ri formatdagi ID (masalan non-UUID string) bazaga so'rov yuborishda syntax error chiqarib, 500 Server Error beradi va Centrifugo/klientlarni cheksiz retry loop (DDoS)ga tushiradi.
* **Qat'iy Qoida:**
  1. Barcha tashqi parametrlarga bazaga kirishdan OLDIN format validatsiyasi (`isUUID`, regex, class-validator) qo'yiladi.
  2. Noto'g'ri formatdagi so'rov hech qachon 500 emas, darhol aniq 400 (Bad Request) yoki Webhook uchun mos error kodi (masalan Centrifugo `code: 1004, temporary: false`) qaytarishi shart.

---

## 4. Context-Scoped Asset Isolation (Fayllarni Aniq Kontekstga Bog'lash) Qoidasi
* **Muammo:** Foydalanuvchining faylga kirish ruxsatini "yuklovchi bilan umumiy qandaydir aloqasi bormi" kabi keng hevristika bilan tekshirish bir operator/mijozning barcha boshqa mijozlar fayllarini o'qib qo'yishiga (IDOR / data leak) olib keladi.
* **Qat'iy Qoida:**
  1. Har bir yuklangan fayl (`Attachment`/`Media`) o'zining aniq resursiga (masalan `Message.id`, `Room.id`, `Transaction.id`) to'g'ridan-to'g'ri foreign key yoki relation bilan bog'lanishi shart.
  2. Ruxsat tekshiruvi: "Foydalanuvchi aynan shu fayl biriktirilgan xona/xabar/tranzaksiya ishtirokchisimi?" degan aniq savolga javob berishi shart.

---

## 5. Adversarial (Red-Team) Testing & Evidence-Before-Claims Qoidasi
* **Muammo:** Faqat to'g'ri ishlash ssenariylarini (Happy Path) testlash va eski konteyner keshiga tayanib "hamma test o'tdi" deb xulosa qilish.
* **Qat'iy Qoida:**
  1. Har bir xavfsizlik va ruxsat o'zgarishiga **buzib ko'rish (Negative/Penetration) testlari** yoziladi:
     - Begona tenant ma'lumotlarini so'rash (Cross-tenant leak).
     - Ruxsatsiz kanalga token so'rash (Bypass attempt).
     - Noto'g'ri signaturalar, expired tokenlar va buzilgan UUID formatlari (Fuzzing).
  2. Barcha testlar toza qayta build qilingan muhitda (`docker compose build --no-cache` yoki CI container) o'tkazilgandagina ish "tayyor" deb e'lon qilinadi.

---

## 6. Strict Cross-Tenant Isolation (Har bir Endpointda Tenant Tekshiruvi) Qoidasi
* **Muammo:** Xonada (`Room`) tenant tekshirilgan, lekin unga bog'liq profilda (`Customer`), tranzaksiyada (`Transaction`), teglarda (`Tags`) yoki sozlamalarda (`FieldConfigs`) tenant ruxsati tekshirilmasa, operator begona mahsulotning barcha mijoz ma'lumotlarini (PII) o'qiy oladi yoki o'zgartira oladi.
* **Qat'iy Qoida:**
  1. Har qanday resurs (Customer, Transaction, Tag, Config, Room) kontrolleri va servisida `assertProductAccess(prisma, user, productId)` markaziy tekshiruvi chaqirilishi shart.
  2. `productId` hech qachon klient body'sidan so'zsiz qabul qilinmaydi; u resursning o'zidan yoki qat'iy tekshirilgan header/token'dan olinishi shart.

---

## 7. Full-Mesh Multi-Service Revocation (Butun Tizim Bo'yicha Hisob Bekor Qilishi) Qoidasi
* **Muammo:** Foydalanuvchi bloklanganda yoki o'chirilganda, faqat `auth` yoki `chat` servisida token tekshirilib, qolgan mikrogvardiyalarda (`call`, `media`, `presence`, `recording`, `notification`, `bot`) eskirgan token ishlashda davom etsa, chetlatilgan xodim tizimga kirishda davom etadi.
* **Qat'iy Qoida:**
  1. Token bekor qilish (Revocation) va hisob holati (`status === 'active'`) tekshiruvi **barcha 100% mikrogvardiyalarning JWT guardlarida** (`AccountStatusGuard`) bir xil darajada tekshirilishi shart.
  2. Redis revocation keshiga asossiz qisqa TTL (masalan 1 soat) qo'yish taqiqlanadi — bloklangan hisob butunlay bloklanganicha qolishi shart.

---

## 8. Consumer-Protocol Validation & Zero-Illusion Observability Qoidasi
* **Muammo:** `/metrics` endpointi `200 OK` qaytargani bilan, agar Content-Type (masalan NestJS default `text/html`) monitoring tizimi (Prometheus) talab qiladigan standartga (`text/plain; version=0.0.4`) mos kelmasa, Prometheus targetlarni rad etadi va monitoring soxta bo'lib qoladi.
* **Qat'iy Qoida:**
  1. Har qanday protokol endpointi (Prometheus, Webhook, Health, SSO) faqat HTTP status bilan emas, **iste'molchi qabul qiladigan aniq Content-Type va Body formati** bilan tasdiqlanishi shart.
  2. Barcha 100% targetlar Prometheus UI / Target statusida `UP (1/1)` holatiga kelishi tekshirilishi shart.

---

## 9. Zero-Silent-Pass & Mandatory Negative Testing Matrix Qoidasi
* **Muammo:** Test fayllarida `if (!token) return;` kabi kodlar bo'lsa, test token ololmaganida hech narsani tekshirmasdan yashil o'tib ketadi va xavfsizlik bor degan yolg'on ishonch uyg'otadi. Shuningdek, faqat "Happy Path" testlanadi.
* **Qat'iy Qoida:**
  1. Test to'plamlarida xatoni yashiruvchi shartli qaytishlar (`if (!token) return`) qat'iyan man etiladi; setup xatosi butun testni fail qilishi shart.
  2. Har bir yangi imkoniyat uchun **Salbiy Matritsa (Negative Matrix)** yozilishi shart:
     - 4 ta rol (customer, operator, supervisor, admin) uchun ruxsatsiz urinishlar (`403 Forbidden`).
     - Begona mahsulot / tenant resursini o'qish/yozish urinishlari (`403 / 404`).
     - Bloklangan/o'chirilgan akkauntning barcha servislarga kirish urinishlari (`401 Unauthorized`).
     - Fuzzing: buzilgan UUID, SQLi, path traversal, noto'g'ri signaturalar (`400 / 401`, hech qachon `500` emas).
