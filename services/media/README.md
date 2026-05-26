# media-service — Port 3004

Fayl yuklash va boshqarish servisi. MinIO S3-compatible presigned URL, thumbnail generation (sharp/ffmpeg).

## Endpointlar

| Method | Path | Tavsif |
|--------|------|--------|
| POST | `/media/presign` | Presigned upload URL olish |
| POST | `/media/confirm` | Upload confirm, DB yozish |
| GET | `/media/:id` | Download URL (TTL 1 soat) |
| GET | `/media/:id/thumbnail` | Thumbnail URL |
| POST | `/media/voice` | Voice message (multipart, max 10MB) |
| GET | `/healthz` | Health check |
| GET | `/metrics` | Prometheus metrics |

## Upload flow

1. `POST /media/presign` — presigned URL va storage_key olish
2. Client → `PUT <presigned_url>` — binary to'g'ridan-to'g'ri MinIO'ga
3. `POST /media/confirm` — checksum tekshirish, DB yozish
4. Async: thumbnail generation (sharp), virus scan (ClamAV, production)

## MIME whitelist

| Tur | Formatlar | Max hajm |
|-----|-----------|----------|
| Rasm | jpg, png, webp, gif, heic | 10 MB |
| Video | mp4, mov, webm | 100 MB |
| Audio | mp3, m4a, ogg, opus | 25 MB |
| Hujjat | pdf, docx, xlsx, pptx, zip | 50 MB |

MIME mismatch → 400 Reject.

## Muhit o'zgaruvchilar

```
DATABASE_URL
MINIO_ENDPOINT=minio:9000
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY, MINIO_SECRET_KEY
MINIO_BUCKET=nova-media
MINIO_USE_SSL=false
PORT=3004
```

## Xavfsizlik

- Pre-signed URL TTL: 1 soat (download), 15 daqiqa (upload)
- EXIF stripping (geolocation)
- ClamAV antivirus (production'da)
