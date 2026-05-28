# Nova Chat — Frontend API Handoff

> **Operator Panel** (Vue 3 + Vite SPA) uchun backend API to'liq reference.  
> Barcha endpointlar Traefik orqali `http://localhost:80` (dev) ga yo'naltiriladi.  
> Header: `Authorization: Bearer <accessToken>` (agar boshqacha ko'rsatilmasa).

---

## 1. AUTH — `auth-service` (port 3001)

Gateway prefix: `/api/v1/auth` → strips to `/auth`

### 1.1 Operatorni login qilish (OTP flow)

Operator login ikki qadam: login → otp/verify.

```
POST /api/v1/auth/login
```
**Request:**
```json
{ "phone": "+998901234567" }
```
**Response 200:**
```json
{ "message": "OTP yuborildi", "ttl": 300 }
```

---

```
POST /api/v1/auth/otp/verify
```
**Request:**
```json
{ "phone": "+998901234567", "otp": "123456" }
```
**Response 200:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "phone": "+998901234567",
    "role": "operator",
    "locale": "uz"
  }
}
```

> **Dev muhitda:** OTP server logida chiqadi (SMS provider yo'q).  
> `docker logs real-time-chat-auth-service-1 | grep OTP`

---

### 1.2 Token yangilash

```
POST /api/v1/auth/refresh
Authorization: — (yo'q)
```
**Request:**
```json
{ "refreshToken": "eyJhbGci..." }
```
**Response 200:** (1.1 bilan bir xil — yangi accessToken + refreshToken)

> **Muhim:** Refresh token rotation — eski token avtomatik bekor bo'ladi.

---

### 1.3 Joriy foydalanuvchi

```
GET /api/v1/auth/me
```
**Response 200:**
```json
{
  "id": "uuid",
  "phone": "+998901234567",
  "email": null,
  "fullName": "Operator Ismi",
  "avatarUrl": null,
  "role": "operator",
  "status": "active",
  "locale": "uz",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### 1.4 Logout

```
POST /api/v1/auth/logout
```
**Response 200:** `{ "message": "Tizimdan chiqdingiz" }`

---

### 1.5 Centrifugo connection token

WebSocket ga ulanishdan **oldin** shu token olinadi.

```
POST /api/v1/auth/centrifugo/token
```
**Request:** `{}` (body shart emas)  
**Response 200:**
```json
{ "token": "eyJhbGci..." }
```

---

### 1.6 Centrifugo channel subscription token

Har bir private kanal uchun alohida subscribe token.

```
POST /api/v1/auth/centrifugo/subscribe
```
**Request:**
```json
{ "channel": "chat:room#<roomId>" }
```
**Response 200:**
```json
{ "token": "eyJhbGci..." }
```

> **Ruxsat etilgan namespace'lar:** `chat`, `presence`, `call`

---

### 1.7 Tilni yangilash

```
PATCH /api/v1/auth/me/locale
```
**Request:** `{ "locale": "uz" }` yoki `{ "locale": "ru" }`  
**Response 200:** `{ "locale": "uz" }`

---

## 2. CHAT — `chat-service` (port 3002)

### 2.1 Xonalar ro'yxati

```
GET /api/v1/rooms?status=open&type=support&limit=50&cursor=<base64>
```

| Query param | Type | Tavsif |
|---|---|---|
| `status` | `open\|closed\|pending\|bot_handling` | Filter (ixtiyoriy) |
| `type` | `support\|direct\|group` | Filter (ixtiyoriy) |
| `limit` | number | Default 50 |
| `cursor` | base64 string | Keyingi sahifa uchun (avvalgi javobdan) |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "support",
      "status": "open",
      "title": null,
      "customerId": "uuid",
      "operatorId": "uuid",
      "lastMessageAt": "2026-05-28T10:00:00.000Z",
      "botHandled": false,
      "metadata": {},
      "createdAt": "2026-05-28T09:00:00.000Z",
      "members": [
        { "userId": "uuid", "joinedAt": "2026-05-28T09:00:00.000Z" }
      ]
    }
  ],
  "nextCursor": "MjAyNi0wNS0yOFQxMDowMDowMC4wMDBa",
  "hasMore": true
}
```

---

### 2.2 Xona yaratish

```
POST /api/v1/rooms
```
**Request:**
```json
{
  "type": "direct",
  "title": "Ixtiyoriy nom",
  "memberIds": ["uuid1", "uuid2"]
}
```
**Response 201:** (yaratilgan room obyekti)

---

### 2.3 Bitta xona

```
GET /api/v1/rooms/:id
```

---

### 2.4 Xonani yopish

```
POST /api/v1/rooms/:id/close
```
**Response 200:** `{ "id": "uuid", "status": "closed" }`

---

### 2.5 Xabarlar ro'yxati

```
GET /api/v1/rooms/:roomId/messages?limit=50&cursor=<base64>
```

| Query param | Tavsif |
|---|---|
| `cursor` | Sahifalash (base64 ISO date) |
| `before` | ISO date — shu vaqtdan oldingi xabarlar |
| `after` | ISO date — shu vaqtdan keyingi xabarlar |

**Response 200:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "senderId": "uuid",
      "type": "text",
      "content": "Salom!",
      "contentLocale": "uz",
      "attachmentId": null,
      "replyToId": null,
      "editedAt": null,
      "deletedAt": null,
      "metadata": {},
      "createdAt": "2026-05-28T10:00:00.000Z"
    }
  ],
  "nextCursor": "MjAyNi0wNS0yOA==",
  "hasMore": false
}
```

---

### 2.6 Xabar yuborish

```
POST /api/v1/rooms/:roomId/messages
```
**Request:**
```json
{
  "content": "Yaxshi, yordam beraman.",
  "type": "text",
  "locale": "uz",
  "replyToId": null,
  "idempotencyKey": "uuid-unique-per-send"
}
```
**Response 201:** (yaratilgan message obyekti)

> `idempotencyKey` — takroriy yuborishlarni oldini olish uchun (network retry).

---

### 2.7 Xabarni tahrirlash

```
PATCH /api/v1/messages/:id
```
**Request:** `{ "content": "Yangi matn" }`  
**Cheklov:** Yuborilganidan 5 daqiqa ichida tahrirlanadi.

---

### 2.8 Xabarni o'chirish

```
DELETE /api/v1/messages/:id
```
**Response 200:** `{ "id": "uuid", "deleted": true }`

---

### 2.9 Xabarni o'qilgan deb belgilash

```
POST /api/v1/messages/:id/read
```
**Response 200:** `{ "id": "uuid", "read": true }`

---

### 2.10 Yozish indikatori (typing)

```
POST /api/v1/rooms/:roomId/typing
```
**Request:** `{ "typing": true }`  
**Response 200:** `{ "ok": true }`

> Centrifugo orqali `chat:room#<roomId>` kanaliga `user.typing` event yuboradi.

---

### 2.11 Qo'llab-quvvatlash so'rovi (customer)

```
POST /api/v1/support/request
```
**Request:**
```json
{
  "subject": "To'lov muammosi",
  "locale": "uz",
  "requiredSkills": ["billing"]
}
```
**Response 200:**
```json
{
  "roomId": "uuid",
  "status": "pending",
  "message": "..."
}
```

---

## 3. PRESENCE — `presence-service` (port 3003)

### 3.1 Operator statusini yangilash

```
POST /api/v1/operator/status
```
**Request:**
```json
{ "status": "available" }
```

| Status | Ma'nosi |
|---|---|
| `available` | Yangi qo'ng'iroq/chat qabul qilishi mumkin |
| `busy` | Band |
| `away` | Vaqtincha yo'q |
| `offline` | Oflayn |

**Response 200:**
```json
{
  "userId": "uuid",
  "status": "available",
  "previous": "offline",
  "ts": "2026-05-28T10:00:00.000Z"
}
```

---

### 3.2 Onlayn operatorlar

```
GET /api/v1/operator/online
```
**Response 200:**
```json
{
  "operators": [
    {
      "id": "uuid",
      "full_name": "Operator Ismi",
      "status": "available",
      "active_chats": 2,
      "max_concurrent_chats": 5,
      "languages": ["uz", "ru"],
      "skills": ["billing", "tech"],
      "is_supervisor": false
    }
  ]
}
```

---

### 3.3 Transfer maqsadlari

```
GET /api/v1/operator/transfer-targets?language=uz&exclude_user_id=<uuid>
```

| Query | Tavsif |
|---|---|
| `language` | Til filtri (ixtiyoriy) |
| `exclude_user_id` | Istisno (default: joriy foydalanuvchi) |

**Response 200:**
```json
{
  "operators": [
    { "id": "uuid", "full_name": "Operator B", "status": "available", "active_chats": 1 }
  ],
  "supervisors": [
    { "id": "uuid", "full_name": "Supervisor A", "status": "busy", "active_chats": 3 }
  ]
}
```

---

## 4. CALL — `call-service` (port 3005)

### 4.1 Qo'ng'iroqqa javob berish

```
POST /api/v1/calls/:id/answer
```
**Response 200:**
```json
{
  "callId": "uuid",
  "status": "connected",
  "livekitRoom": "call-<id>",
  "callerToken": "eyJhbGci...",
  "operatorToken": "eyJhbGci..."
}
```

> `operatorToken` — LiveKit brauzer SDK'ga beriladi. Shu tokenni olganingizdan keyin LiveKit'ga `connect()` qilinadi.

---

### 4.2 Qo'ng'iroqni tugatish

```
POST /api/v1/calls/:id/hangup
```
**Request (ixtiyoriy):** `{ "cause": "operator_hangup" }`  
**Response 200:** `{ "callId": "uuid", "status": "completed" }`

---

### 4.3 Hold / Unhold

```
POST /api/v1/calls/:id/hold
```
**Request:** `{ "hold": true }` yoki `{ "hold": false }`  
**Response 200:** `{ "callId": "uuid", "status": "on_hold" }`

---

### 4.4 Mute / Unmute

```
POST /api/v1/calls/:id/mute
```
**Request:** `{ "muted": true }`  
**Response 200:** `{ "callId": "uuid", "muted": true }`

---

### 4.5 Cold transfer

```
POST /api/v1/calls/:id/transfer
```
**Request:**
```json
{
  "type": "cold",
  "toOperatorId": "uuid"
}
```
**Response 200:**
```json
{
  "callId": "uuid",
  "transferId": "uuid",
  "type": "cold",
  "status": "completed"
}
```

---

### 4.6 Warm transfer (maslahat)

```
POST /api/v1/calls/:id/transfer
```
**Request:** `{ "type": "warm", "toOperatorId": "uuid" }`  
**Response 200:**
```json
{
  "callId": "uuid",
  "transferId": "uuid",
  "type": "warm",
  "status": "consulting",
  "consultRoom": "consult-<callId>",
  "fromToken": "eyJhbGci...",
  "toToken": "eyJhbGci..."
}
```

> `consultRoom` va `fromToken` — ikkala operator konsultatsiya uchun alohida LiveKit xonasiga ulanadi. Asosiy qo'ng'iroq `on_hold` bo'ladi.

---

### 4.7 Warm transfer yakunlash

```
POST /api/v1/calls/:id/transfer/complete
```
**Response 200:** `{ "callId": "uuid", "transferId": "uuid", "status": "completed" }`

---

### 4.8 Warm transfer bekor qilish

```
POST /api/v1/calls/:id/transfer/cancel
```
**Response 200:** `{ "callId": "uuid", "transferId": "uuid", "status": "canceled" }`

---

### 4.9 Yozishni boshlash (Recording — Consent flow)

**1-qadam: Consent e'lon qilish**
```
POST /api/v1/calls/:id/recording/start
```
**Response 200:**
```json
{
  "recordingId": "uuid",
  "status": "starting",
  "consentAnnounced": false
}
```

> Centrifugo orqali `chat:user#<callerId>` ga audio prompt signali yuboradi.  
> **10 soniya** ichida consent-ack bo'lmasa, avtomatik `status: failed`.

**2-qadam: Mijoz roziligini tasdiqlash**
```
POST /api/v1/calls/:id/recording/consent-ack
```
**Request:**
```json
{ "recordingId": "uuid" }
```
**Response 200:**
```json
{
  "recordingId": "uuid",
  "status": "active",
  "egressId": "eg-..."
}
```

---

### 4.10 Yozishni to'xtatish

```
POST /api/v1/calls/:id/recording/stop
```
**Response 200:**
```json
{
  "recordingId": "uuid",
  "status": "processing",
  "durationMs": 60000
}
```

---

### 4.11 Chiquvchi qo'ng'iroq (operator → mijoz)

```
POST /api/v1/calls/outbound
```
**Request:**
```json
{
  "calleeId": "uuid",
  "subject": "Qayta qo'ng'iroq"
}
```
**Response 200:** `{ "call": {...}, "status": "ringing", "livekitRoom": "call-..." }`

---

### 4.12 Qo'ng'iroqlar tarixi

```
GET /api/v1/calls?limit=20&offset=0
```
**Response 200:**
```json
{
  "calls": [{ "id": "uuid", "status": "completed", "direction": "inbound", "talkDurationMs": 120000 }],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

---

### 4.13 LiveKit token (qo'shimcha)

```
POST /api/v1/calls/livekit/token
```
**Request:** `{ "callId": "uuid" }`  
**Response 200:**
```json
{
  "token": "eyJhbGci...",
  "room": "call-<callId>"
}
```

> Odatda token `/calls/:id/answer` javobida keladi. Bu endpoint qayta ulanish uchun.

---

## 5. RECORDING — `recording-service` (port 3007)

### 5.1 Recording ma'lumotlari (signed URL bilan)

```
GET /api/v1/recordings/:id
```
**Response 200:**
```json
{
  "id": "uuid",
  "callId": "uuid",
  "startedBy": "uuid",
  "status": "completed",
  "storageKey": "recordings/2026/05/call-id.mp3",
  "durationMs": 60000,
  "sizeBytes": "1024000",
  "startedAt": "2026-05-28T10:00:00.000Z",
  "signedUrl": "http://minio:9000/nova-recordings/recordings/...?X-Amz-Signature=...",
  "call": { "id": "uuid", "calleeId": "uuid", "callerId": "uuid" }
}
```

> `signedUrl` faqat `status === "completed"` bo'lsa keladi (1 soat amal qiladi).  
> **Access:** admin/supervisor = barcha; operator = o'z recordinglarini; customer = 403.

---

### 5.2 Qo'ng'iroq recordinglarini olish

```
GET /api/v1/recordings/by-call/:callId
```
**Response 200:**
```json
{
  "callId": "uuid",
  "recordings": [
    { "id": "uuid", "status": "completed", "durationMs": 60000, "startedAt": "..." }
  ]
}
```

---

## 6. CENTRIFUGO — Real-time WebSocket

### 6.1 Ulanish

```
WebSocket URL: ws://localhost:8000/connection/websocket
```

**JavaScript (centrifuge-js library):**
```javascript
import { Centrifuge } from 'centrifuge';

// 1. Connection token olish
const { token } = await api.post('/auth/centrifugo/token');

// 2. Ulanish
const centrifuge = new Centrifuge('ws://localhost:8000/connection/websocket', { token });
centrifuge.connect();
```

---

### 6.2 Kanallar va eventlar

#### `chat:user#<userId>` — Shaxsiy kanallar

Operator uchun muhim eventlar:

| Event | Trigger | Payload misoli |
|---|---|---|
| `call.incoming` | Yangi qo'ng'iroq keldi | `{ callId, callerId, livekitRoom, ts }` |
| `call.transfer.incoming` | Cold transfer keldi | `{ callId, fromOperatorId, livekitRoom, ts }` |
| `call.transfer.consult` | Warm transfer taklifi | `{ callId, transferId, consultRoom, fromOperatorId, ts }` |
| `play_audio` | Audio faylni chalish (hold, consent) | `{ url, target: "all"\|"caller"\|"operator" }` |
| `recording.state` | Recording holati | `{ recordingId, state, callId }` |
| `new_room_assigned` | Yangi chat xonasi tayinlandi | `{ roomId, customerId, ts }` |

**Ulanish:**
```javascript
// Subscribe token (private kanal uchun)
const { token: subToken } = await api.post('/auth/centrifugo/subscribe', {
  channel: `chat:user#${userId}`
});

const sub = centrifuge.newSubscription(`chat:user#${userId}`, { token: subToken });

sub.on('publication', ({ data }) => {
  if (data.event === 'call.incoming') {
    showIncomingCallModal(data);
  }
});

sub.subscribe();
```

---

#### `chat:room#<roomId>` — Xona kanali

| Event | Trigger | Payload misoli |
|---|---|---|
| `message.created` | Yangi xabar | `{ message: { id, senderId, content, type, createdAt } }` |
| `message.updated` | Xabar tahrirlandi | `{ message: { id, content, editedAt } }` |
| `message.deleted` | Xabar o'chirildi | `{ messageId }` |
| `user.typing` | Yozmoqda | `{ userId, typing: true\|false }` |

```javascript
const { token: roomToken } = await api.post('/auth/centrifugo/subscribe', {
  channel: `chat:room#${roomId}`
});

const roomSub = centrifuge.newSubscription(`chat:room#${roomId}`, { token: roomToken });

roomSub.on('publication', ({ data }) => {
  if (data.event === 'message.created') {
    addMessageToUI(data.message);
  }
  if (data.event === 'user.typing') {
    showTypingIndicator(data.userId, data.typing);
  }
});

roomSub.subscribe();
```

---

#### `call:<callId>` — Qo'ng'iroq kanali

| Event | Trigger | Payload |
|---|---|---|
| `call.connected` | Javob berildi | `{ callId, operatorId, ts }` |
| `call.ended` | Qo'ng'iroq tugadi | `{ callId, status, hangupBy, ts }` |
| `call.hold` | Hold qilingan/chiqarilgan | `{ callId, hold: true\|false, ts }` |
| `call.mute` | Mute | `{ callId, muted, userId, ts }` |

```javascript
const callSub = centrifuge.newSubscription(`call:${callId}`);
callSub.on('publication', ({ data }) => {
  if (data.event === 'call.ended') {
    endCallUI(data);
  }
});
callSub.subscribe();
```

---

## 7. LIVEKIT — Browser WebRTC

### 7.1 Ulanish

```javascript
import { Room, RoomEvent, Track } from 'livekit-client';

// Token /calls/:id/answer javobidagi operatorToken
const room = new Room();

await room.connect('ws://localhost:7880', operatorToken);

// Audio track publish
await room.localParticipant.setMicrophoneEnabled(true);
```

### 7.2 Token qayerdan keladi

| Holat | Token manbai |
|---|---|
| Operatorn qo'ng'iroqqa javob bersa | `POST /calls/:id/answer` → `operatorToken` |
| Caller uchun | Yuqoridagi → `callerToken` (Centrifugo orqali callerga yetkaziladi) |
| Warm transfer consult | `POST /calls/:id/transfer` → `fromToken` / `toToken` |
| Qayta ulanish | `POST /calls/livekit/token` |

### 7.3 Muhim events

```javascript
room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  if (track.kind === Track.Kind.Audio) {
    track.attach(); // audio elementga biriktirish
  }
});

room.on(RoomEvent.ParticipantDisconnected, (participant) => {
  // Operator yoki caller chiqib ketdi
});

room.on(RoomEvent.Disconnected, () => {
  // Xona yopildi
});
```

### 7.4 Dev/Prod URL

```
Dev:  ws://localhost:7880
Prod: wss://livekit.your-domain.com
```

> **Windows Docker Desktop eslatmasi:** LiveKit `network_mode: host` ishlaydi, 
> lekin bridge konteynerlardan `host.docker.internal:7880` orqali kirish 
> cheklangan. Brauzerdan to'g'ridan `localhost:7880` ishlaydi.

---

## 8. Xatolar

Barcha endpoint'lar standart NestJS HTTP xatolarini qaytaradi:

```json
{ "statusCode": 401, "message": "Unauthorized" }
{ "statusCode": 403, "message": "Bu amalni bajarish uchun huquq yo'q" }
{ "statusCode": 404, "message": "Qo'ng'iroq topilmadi" }
{ "statusCode": 409, "message": "Yozish allaqachon boshlangan" }
```

---

## 9. Muhit o'zgaruvchilari (Vue `.env`)

```env
VITE_API_BASE=http://localhost:80/api/v1
VITE_WS_URL=ws://localhost:8000/connection/websocket
VITE_LIVEKIT_URL=ws://localhost:7880
```

---

## 10. Tezkor boshlash (Vue composable misoli)

```javascript
// composables/useAuth.js
export function useAuth() {
  async function login(phone) {
    await api.post('/auth/login', { phone });
  }

  async function verify(phone, otp) {
    const { data } = await api.post('/auth/otp/verify', { phone, otp });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.user;
  }

  async function refreshTokens() {
    const rt = localStorage.getItem('refreshToken');
    const { data } = await api.post('/auth/refresh', { refreshToken: rt });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
  }

  return { login, verify, refreshTokens };
}
```

```javascript
// composables/useCentrifuge.js
import { Centrifuge } from 'centrifuge';

let centrifuge = null;

export function useCentrifuge() {
  async function connect(userId) {
    const { data } = await api.post('/auth/centrifugo/token');
    centrifuge = new Centrifuge(import.meta.env.VITE_WS_URL, { token: data.token });
    centrifuge.connect();
    return centrifuge;
  }

  async function subscribeRoom(roomId, onMessage) {
    const { data } = await api.post('/auth/centrifugo/subscribe', {
      channel: `chat:room#${roomId}`
    });
    const sub = centrifuge.newSubscription(`chat:room#${roomId}`, { token: data.token });
    sub.on('publication', ({ data: payload }) => onMessage(payload));
    sub.subscribe();
    return sub;
  }

  async function subscribePersonal(userId, onEvent) {
    const { data } = await api.post('/auth/centrifugo/subscribe', {
      channel: `chat:user#${userId}`
    });
    const sub = centrifuge.newSubscription(`chat:user#${userId}`, { token: data.token });
    sub.on('publication', ({ data: payload }) => onEvent(payload));
    sub.subscribe();
    return sub;
  }

  return { connect, subscribeRoom, subscribePersonal };
}
```

```javascript
// composables/useLiveKit.js
import { Room, RoomEvent, Track } from 'livekit-client';

export function useLiveKit() {
  let room = null;

  async function joinCall(token) {
    room = new Room();
    await room.connect(import.meta.env.VITE_LIVEKIT_URL, token);
    await room.localParticipant.setMicrophoneEnabled(true);

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.attach();
    });

    return room;
  }

  async function leaveCall() {
    await room?.disconnect();
    room = null;
  }

  async function setMute(muted) {
    await room?.localParticipant.setMicrophoneEnabled(!muted);
  }

  return { joinCall, leaveCall, setMute };
}
```

---

*Bu hujjat Phase 8 tugagandan keyin generatsiya qilingan. Barcha endpoint'lar ishchi holatda test qilingan.*
