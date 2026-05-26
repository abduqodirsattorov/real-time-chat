#!/bin/bash
# Nova Chat — PostgreSQL + MinIO backup
# Ishlatish: ./scripts/backup.sh [output_dir]
# Cron misoli: 0 2 * * * /path/to/backup.sh /backups

set -e

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="$BACKUP_DIR/nova_backup_$TIMESTAMP"

PG_USER="${POSTGRES_USER:-nova}"
PG_DB="${POSTGRES_DB:-nova_chat}"

echo "💾 Backup boshlandi: $TIMESTAMP"
mkdir -p "$BACKUP_PATH"

# PostgreSQL dump
echo "  PostgreSQL dump..."
docker compose exec -T postgres pg_dump -U "$PG_USER" "$PG_DB" \
  | gzip > "$BACKUP_PATH/postgres.sql.gz"
echo "  ✓ postgres.sql.gz"

# MinIO media backup (mc mirror)
if command -v mc &> /dev/null; then
  echo "  MinIO media sync..."
  mc alias set local http://localhost:9000 \
    "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin123}" --quiet
  mc mirror local/nova-media "$BACKUP_PATH/media/" --quiet
  mc mirror local/nova-recordings "$BACKUP_PATH/recordings/" --quiet
  echo "  ✓ MinIO fayllar"
else
  echo "  ⚠️  mc topilmadi — MinIO backup o'tkazib yuborildi"
fi

# Backup hajmi
BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo ""
echo "✅ Backup yakunlandi!"
echo "   Joylashuv: $BACKUP_PATH"
echo "   Hajm: $BACKUP_SIZE"
