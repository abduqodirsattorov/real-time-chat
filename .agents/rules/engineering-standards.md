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

---

## 10. Fail-Closed Secrets & Zero-Default-Credentials Qoidasi
* **Muammo:** `JWT_SECRET ?? 'dev_secret'` yoki `INTERNAL_SERVICE_KEY ?? 'internal_service_default_secret_key'` kabi fallbacklar productionda env sozlanmaganda ochiq qolib, tizimni soxta tokenlar yoki admin kirishlariga zaif qiladi.
* **Qat'iy Qoida:**
  1. Barcha servislar startup paytida o'z maxfiy kalitlarini (`JWT_SECRET`, `INTERNAL_SERVICE_KEY`, `CENTRIFUGO_WEBHOOK_SECRET`) qat'iy tekshiradi.
  2. Kalit belgilanmagan yoki ma'lum dev-qiymat bo'lsa, servis ishga tushmasdan (`throw new Error`) darhol to'xtaydi (fail-closed). Hech qanday fallbackga yo'l qo'yilmaydi.

---

## 11. Absolute Zero-Trust for Operators (Tenant Chegaralarini Buzmaslik) Qoidasi
* **Muammo:** Kodda `if (isStaff) return;` yoki `if (['operator', 'admin'].includes(user.role)) return room;` orqali operatorga barcha tenantlar ma'lumotlariga ruxsat berish cross-tenant ma'lumot sizishiga (audio eshitish, rasm/hujjat yuklab olish) olib keladi.
* **Qat'iy Qoida:**
  1. Operator roli HECH QACHON tenant tekshiruvini chetlab o'tolmaydi.
  2. Faqat super-admin (`admin`) barcha tenantlarni ko'ra oladi; `operator` va `supervisor` esa FAQAT `operator_products` dagi biriktirilgan mahsulotlarga tegishli qo'ng'iroq, navbat, xona va fayllarga kira oladi.

---

## 12. Default-Deny for Real-Time & Webhooks Qoidasi
* **Muammo:** Centrifugo subscribe kontrollerida noma'lum kanallar uchun `{ result: {} }` qaytarish yoki webhook kontrollerida imzo yo'qligida `return true` qilish.
* **Qat'iy Qoida:**
  1. Centrifugo va WebSocket kanallari aniq oq ro'yxatga (whitelisted patterns) ega bo'lishi shart. Ro'yxatdan tashqari har qanday kanal qat'iy rad etiladi (`code: 1000`).
  2. Barcha webhook kontrollerlari `rawBody: true` bilan sozlangan bo'lishi va byte-for-byte HMAC imzo tekshiruvini majburiy bajarishi shart. Imzosiz yoki noto'g'ri imzo bilan kelgan so'rovlar darhol 401/403 qaytaradi.

---

## 13. Dynamic Role Consistency & True Session Revocation Qoidasi
* **Muammo:** Rol o'zgarganda (demote) foydalanuvchi mavjud JWT muddati tugaguncha eski rolda qolishi yoki logout faqat noto'g'ri jti'ni o'chirishi natijasida refresh token yashab qolishi.
* **Qat'iy Qoida:**
  1. `account-status.ts` da har bir so'rovda keshdan foydalanuvchining joriy roli ham tekshiriladi; agar bazadagi rol JWT dagidan farq qilsa, so'rov rad etiladi yoki rol yangilanadi.
  2. Logout amali refresh tokenni Redis'dan to'liq yo'q qiladi va access token jti'sini qora ro'yxatga qo'shadi.

---

## 14. Atomic Telephony Lifecycle Transitions Qoidasi
* **Muammo:** Qo'ng'iroqni tugatish (`hangupCall`) yoki o'tkazish (`executeColdTransfer`) paytida bir nechta mustaqil DB so'rovlari va LiveKit chaqiruvlari ketma-ket bajarilib, oradagi xatolik sabab operator `onCall: true` bo'lib qotib qolishi.
* **Qat'iy Qoida:**
  1. Barcha DB holat o'zgarishlari (Call status, OperatorState, CallTransfer) `prisma.$transaction` ichida atomik bajariladi.
  2. LiveKit/tashqi xizmatlar xatosi DB tranzaksiyasining izchilligini buzmasligi va resurslar tozalanishi (compensating actions) kafolatlanadi.

---

## 15. Private Object Storage Invariant (S3/MinIO Qat'iy Yopiq Bo'lishi) Qoidasi
* **Muammo:** S3/MinIO bucketlariga `anonymous set download` berilsa, barcha mijoz pasportlari, audio yozuvlar va shaxsiy hujjatlar URL yoki UUID topilgan taqdirda autentifikatsiyasiz ochiq yuklab olinadi.
* **Qat'iy Qoida:**
  1. Barcha S3/MinIO bucketlari `mc anonymous set none` bilan MUTLAQ YOPIQ (private) qilinadi.
  2. Barcha fayllarga kirish faqat xizmat API'si orqali, qat'iy autentifikatsiya va qisqa muddatli (maksimal 15 daqiqa) signed URL orqali amalga oshiriladi.

---

## 16. Fail-Closed Webhooks & Mandatory Byte-level HMAC Qoidasi
* **Muammo:** Webhook kontrollerida imzo tekshirish blokida `catch (err) { /* warn and continue */ }` kabi fail-open yozilsa, hujumchi soxta eventlar yuborib yozuvlarni tugatishi, soxta tranzaksiya holatlarini o'rnatishi mumkin.
* **Qat'iy Qoida:**
  1. Webhook kontrollerlarida hech qanday dev-bypass yoki ogohlantirish bilan o'tkazib yuborishga yo'l qo'yilmaydi.
  2. Raw body mavjud bo'lishi va byte-for-byte HMAC imzo tekshiruvi bajarilishi shart. Noto'g'ri yoki yo'q imzo darhol `401 Unauthorized` bilan to'xtatiladi.
  3. Muhitda webhook secret yo'q bo'lsa, servis startup paytida xato tashlab ishga tushmaydi (`fail-closed`).

---

## 17. Financial Identity Invariant (Operator Identity Never from Body) Qoidasi
* **Muammo:** Tranzaksiya yoki audit talab qiluvchi amallarda `operatorId` request body yoki query'dan olinsa (`body.operatorId ?? user.sub`), bir xodim boshqa xodim nomidan noqonuniy amallarni bajarib, audit trailni soxtalashtirishi mumkin.
* **Qat'iy Qoida:**
  1. Moliyaviy va ma'muriy amallarda ijrochi ID'si HECH QACHON mijoz yuborgan body'dan olinmaydi. Ijrochi FAQAT va FAQAT server tomonidan tasdiqlangan JWT token (`req.user.sub`) orqali olinadi.
  2. Barcha tranzaksiyaviy amallar qat'iy Allowlist DTO (`action`), unikal Idempotency Key va sabab kodi (`reason`, minimum 5 belgi) bilan ta'minlanishi shart.

---

## 18. Trusted Reverse-Proxy Rate Limiting & Anti-Spoofing Qoidasi
* **Muammo:** Rate limiter klient yuborgan xom `X-Forwarded-For` sarlavhasiga ishonsa, hujumchi ushbu sarlavhaga tasodifiy IP yozib cheklovlarni (DDoS, brute-force) to'liq chetlab o'tadi.
* **Qat'iy Qoida:**
  1. Klient jo'natgan `X-Forwarded-For` ga to'g'ridan-to'g'ri ishonish qat'iyan taqiqlanadi.
  2. Express/Fastify serverlarida `trust proxy` faqat 1-darajali ichki reverse-proxy (Traefik/Nginx) uchun yoqiladi va IP faqat `req.ip` orqali olinadi.

---

## 19. Production Configuration Isolation & Zero-Dev-Secret Qoidasi
* **Muammo:** `docker-compose.yml` da `mock-nova`, default `minioadmin` va `change_me` kalitlari default qiymat sifatida tursa, tasodifan real deployda zaif kalitlar bilan ishlab ketish xavfi yuzaga keladi.
* **Qat'iy Qoida:**
  1. Production muhiti uchun alohida `docker-compose.prod.yml` yoki Kubernetes manifestlari ishlatiladi.
  2. Production deployda barcha maxfiy kalitlar (Secrets) tashqi Vault/KMS yoki xavfsiz muhit orqali yuklanadi va startup'da ularning murakkabligi (entropiyasi) qat'iy tekshiriladi.
  3. Mock xizmatlar production konfiguratsiyasiga mutlaqo kiritilmaydi.

---

## 20. Zero-PII & Secret Log Scrubbing Invariant Qoidasi
* **Muammo:** `Authorization` headerlari, cookie fayllar, pasport ma'lumotlari, karta raqamlari yoki webhook signaturalari server loglariga tushsa, bu PCI-DSS va O'zbekiston MB 3759-sonli nizomini qo'pol ravishda buzadi.
* **Qat'iy Qoida:**
  1. Barcha mikroservislarning logging tizimida (Pino/Winston) `redact` qoidalari majburiy o'rnatiladi.
  2. `authorization`, `cookie`, `secret`, `password`, `token`, `otp`, `signature`, `pan`, `passport` maydonlari avtomatik `[REDACTED]` qilinadi.


