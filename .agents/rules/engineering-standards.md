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
