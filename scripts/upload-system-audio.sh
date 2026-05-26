#!/bin/bash
# Nova Chat — Tizim audio fayllarini MinIO'ga yuklash
# Ishlatish: ./scripts/upload-system-audio.sh
# Yoki: make audio-upload

set -e

MINIO_ALIAS="${MINIO_ALIAS:-local}"
MINIO_URL="${MINIO_URL:-http://localhost:9000}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin123}"
BUCKET="nova-media"
AUDIO_DIR="./assets/audio"

echo "🎵 Audio fayllarni MinIO'ga yuklash boshlandi..."

# mc o'rnatilganligini tekshirish
if ! command -v mc &> /dev/null; then
  echo "❌ 'mc' (MinIO Client) topilmadi."
  echo "   O'rnatish: https://min.io/docs/minio/linux/reference/minio-mc.html"
  echo ""
  echo "   Docker orqali:"
  echo "   docker run --rm -it --network nova-chat_nova-net \\"
  echo "     -v \$(pwd)/assets/audio:/audio minio/mc:latest \\"
  echo "     alias set local http://minio:9000 $MINIO_USER $MINIO_PASS && \\"
  echo "     mc cp /audio/recording_uz.mp3 local/$BUCKET/sys/recording_uz.mp3"
  exit 1
fi

# Alias o'rnatish
mc alias set "$MINIO_ALIAS" "$MINIO_URL" "$MINIO_USER" "$MINIO_PASS" --quiet

# Bucket mavjudligini tekshirish
mc mb -p "$MINIO_ALIAS/$BUCKET" || true

# Audio fayllarni yuklash
for file in recording_uz.mp3 recording_ru.mp3 hold_music.mp3; do
  if [ -f "$AUDIO_DIR/$file" ]; then
    mc cp "$AUDIO_DIR/$file" "$MINIO_ALIAS/$BUCKET/sys/$file" --quiet
    echo "  ✓ $file yuklandi"
  else
    echo "  ⚠️  $file topilmadi: $AUDIO_DIR/$file"
    echo "     Placeholder yaratish uchun: make audio-generate"
  fi
done

echo ""
echo "✅ Audio yuklash tugadi!"
echo "   MinIO console: http://localhost:9001"
echo "   Bucket: $BUCKET/sys/"
