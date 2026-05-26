# recording-service — Port 3007

LiveKit Egress orqali qo'ng'iroq yozish va MinIO'ga saqlash servisi.

## Endpointlar

| Method | Path | Tavsif |
|--------|------|--------|
| POST | `/recordings/start` | Egress boshlash (call-service'dan) |
| POST | `/recordings/stop` | Egress to'xtatish |
| POST | `/webhooks/livekit/egress` | LiveKit egress webhook |
| GET | `/recordings/:id` | Metadata + signed URL |
| GET | `/recordings/by-call/:callId` | Call bo'yicha yozuvlar |
| GET | `/healthz` | Health check |
| GET | `/metrics` | Prometheus metrics |

## Saqlash

- Bucket: `nova-recordings`
- Key format: `recordings/{YYYY}/{MM}/{call_id}.mp3`
- Retention: 90 kun (MinIO lifecycle policy)
- Format: audio-only MP3

## Kirish huquqi (Access control)

Faqat quyidagilar signed URL ola oladi:
- Admin
- Supervisor
- Recording boshlagan operator
- O'sha qo'ng'iroqning operatori

Har bir kirish `audit_logs`'ga yoziladi (kim, qachon, IP, user-agent).

## LiveKit Egress webhook eventlari

| Event | Natija |
|-------|--------|
| `egress_started` | `status=active` |
| `egress_ended` | `status=completed`, duration, size, storage_key |
| `egress_failed` | `status=failed`, reason |

## Muhit o'zgaruvchilar

```
DATABASE_URL
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY, MINIO_SECRET_KEY
MINIO_BUCKET=nova-recordings
MINIO_USE_SSL=false
LIVEKIT_HOST=http://host.docker.internal:7880
LIVEKIT_API_KEY, LIVEKIT_SECRET
PORT=3007
```
