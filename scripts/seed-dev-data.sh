#!/bin/bash
# Nova Chat — Dev ma'lumotlar bilan to'ldirish
# Bu script chat-service'ning seed:dev buyrug'ini ishga tushiradi.
# Ishlatish: ./scripts/seed-dev-data.sh
# Yoki: make seed

set -e

echo "🌱 Dev seed boshlandi..."

# chat-service'da seed ishga tushirish
docker compose exec -T chat-service npm run seed:dev

echo ""
echo "✅ Seed bajarildi!"
echo ""
echo "Demo foydalanuvchilar:"
echo "  Operator: operator@nova.local / demo1234"
echo "  Supervisor: supervisor@nova.local / demo1234"
echo "  Admin: admin@nova.local / demo1234"
echo ""
echo "Demo mijoz (phone OTP):"
echo "  Phone: +998901234567"
echo "  OTP (dev): 123456"
