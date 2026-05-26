# bot-gateway — Port 3008 (PHASE 10 STUB)

> **DIQQAT:** Bu servis Phase 10'da implementatsiya qilinadi.
> Hozir bu papka bo'sh. Schema va RabbitMQ queue tayyor.

## Rejadagi arxitektura

RabbitMQ `bot.inbox` queue'ni eshitadi (`message.created` eventlar, faqat `room.status='bot_handling'`).

### Bot turlari (Phase 10'da)

| Tur | Tavsif |
|-----|--------|
| `faq` | Intent matching, JSON config |
| `ai` | Claude/OpenAI API integratsiya |
| `hybrid` | Avval FAQ, ishonchli javob yo'q bo'lsa AI |

### Handoff triggerlari

- Mijoz `handoff_keywords` (operator, оператор, odam, человек) yozsa
- Bot confidence < threshold
- Bot 3+ marta tushunmasa

Handoff → `room.status='open'` → ACD ishga tushadi → `bot.handoff` system message

### Kelajakdagi endpointlar

```
POST /bot/configs    — Bot yaratish/yangilash
GET  /bot/configs    — Ro'yxat
POST /bot/test       — Test xabar yuborish
POST /bot/handoff/:roomId — Operator'ga eskalatsiya
```

## Hozir tayyor bo'lgan narsalar

- `bot_configs` jadvali (DB)
- `users.role='bot'` enum qiymati
- `message.type IN ('bot_card', 'bot_quick_reply')` enum qiymatlari
- `bot.inbox` RabbitMQ queue (bo'sh consumer)
- `room.status='bot_handling'` enum qiymati
- `rooms.bot_handled` va `rooms.escalated_at` ustunlari

## Xavfsizlik (Phase 10'da)

- Bot JWT sub prefix: `bot:<id>`
- AI provider API keys faqat bu servis ichida
- Bot output: XSS va prompt injection filtr
