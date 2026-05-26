.PHONY: up down logs ps migrate seed test load-test reset-db audio-upload \
        build pull infra-up services-up shell-auth shell-chat shell-call \
        rabbit-setup check-env help

# ─── Asosiy komandalar ────────────────────────────────────────────────────────

help: ## Bu yordamni ko'rsatish
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

check-env: ## .env faylini tekshirish
	@test -f .env || (echo "❌ .env fayl topilmadi! Qiling: cp .env.example .env" && exit 1)
	@echo "✓ .env fayl mavjud"

pull: ## Docker image'larni yangilash
	docker compose pull

build: ## Barcha mikroservislarni build qilish
	docker compose build --parallel

infra-up: check-env ## Faqat infra servislarni ko'tarish (DB, Redis, MQ va h.k.)
	docker compose up -d postgres redis minio rabbitmq meilisearch centrifugo
	@echo "⏳ Infra servislar tayyor bo'lishini kutish..."
	@sleep 8
	docker compose ps

services-up: ## Faqat mikroservislarni ko'tarish (infra tayyor bo'lgandan keyin)
	docker compose up -d auth-service chat-service presence-service \
		media-service call-service notification-service recording-service

up: check-env ## Barcha servislarni ko'tarish (infra + mikroservislar + monitoring)
	docker compose up -d
	@echo "⏳ Servislar ishga tushishini kutish (15s)..."
	@sleep 15
	@$(MAKE) ps
	@echo ""
	@echo "✅ Nova Chat Platform tayyor!"
	@echo "   Grafana:       http://localhost:3000  (admin/admin)"
	@echo "   MinIO console: http://localhost:9001  (minioadmin/minioadmin123)"
	@echo "   RabbitMQ:      http://localhost:15672 (nova/nova_dev_pass)"
	@echo "   Centrifugo:    http://localhost:8000/admin"
	@echo "   Traefik:       http://localhost:8080"
	@echo "   Prometheus:    http://localhost:9090"

down: ## Barcha servislarni to'xtatish (volumelar saqlanadi)
	docker compose down

ps: ## Servislar holati
	docker compose ps

logs: ## Barcha servislar loglari (real-time)
	docker compose logs -f --tail=100

logs-infra: ## Faqat infra loglari
	docker compose logs -f postgres redis rabbitmq centrifugo meilisearch

logs-services: ## Faqat mikroservislar loglari
	docker compose logs -f auth-service chat-service presence-service \
		media-service call-service notification-service recording-service

# ─── Database ────────────────────────────────────────────────────────────────

migrate: ## Barcha servislar Prisma migrationlarini ishga tushirish
	docker compose exec auth-service npx prisma migrate deploy
	docker compose exec chat-service npx prisma migrate deploy
	docker compose exec presence-service npx prisma migrate deploy
	docker compose exec media-service npx prisma migrate deploy
	docker compose exec call-service npx prisma migrate deploy
	docker compose exec notification-service npx prisma migrate deploy
	docker compose exec recording-service npx prisma migrate deploy
	@echo "✅ Migration'lar bajarildi"

seed: ## Dev ma'lumotlar bilan to'ldirish
	docker compose exec chat-service npm run seed:dev
	@echo "✅ Seed bajarildi"

rabbit-setup: ## RabbitMQ exchange va queue'larni yaratish (boot'da avtomatik ham bo'ladi)
	docker compose exec rabbitmq rabbitmqadmin declare exchange name=nova.events type=topic durable=true
	docker compose exec rabbitmq rabbitmqadmin declare queue name=notification.push durable=true
	docker compose exec rabbitmq rabbitmqadmin declare queue name=bot.inbox durable=true
	docker compose exec rabbitmq rabbitmqadmin declare queue name=audit.log durable=true
	docker compose exec rabbitmq rabbitmqadmin declare queue name=meilisearch.index durable=true
	docker compose exec rabbitmq rabbitmqadmin declare binding source=nova.events destination=notification.push routing_key=message.created
	docker compose exec rabbitmq rabbitmqadmin declare binding source=nova.events destination=notification.push routing_key=call.initiated
	docker compose exec rabbitmq rabbitmqadmin declare binding source=nova.events destination=bot.inbox routing_key=message.created
	docker compose exec rabbitmq rabbitmqadmin declare binding source=nova.events destination=audit.log routing_key="#"
	docker compose exec rabbitmq rabbitmqadmin declare binding source=nova.events destination=meilisearch.index routing_key=message.created
	@echo "✅ RabbitMQ topology tayyor"

# ─── Audio ───────────────────────────────────────────────────────────────────

audio-upload: ## Tizim audio fayllarni MinIO'ga yuklash
	./scripts/upload-system-audio.sh

audio-generate: ## Placeholder audio fayllarni qayta generatsiya qilish (Python + gtts)
	python3 scripts/generate-audio.py

# ─── Testing ─────────────────────────────────────────────────────────────────

test: ## Barcha servislar unit testlarini ishga tushirish
	docker compose exec auth-service npm test
	docker compose exec chat-service npm test
	docker compose exec call-service npm test
	docker compose exec presence-service npm test
	docker compose exec media-service npm test

test-auth: ## Faqat auth-service test
	docker compose exec auth-service npm test

test-chat: ## Faqat chat-service test
	docker compose exec chat-service npm test

test-call: ## Faqat call-service test
	docker compose exec call-service npm test

load-test-chat: ## Chat load test (k6, 10K concurrent WebSocket)
	k6 run tests/load/chat-flood.js

load-test-call: ## Call storm test (k6, 200 parallel call)
	k6 run tests/load/call-storm.js

# ─── Shell'lar ───────────────────────────────────────────────────────────────

shell-auth: ## auth-service ichiga kirish
	docker compose exec auth-service sh

shell-chat: ## chat-service ichiga kirish
	docker compose exec chat-service sh

shell-call: ## call-service ichiga kirish
	docker compose exec call-service sh

shell-db: ## PostgreSQL'ga kirish
	docker compose exec postgres psql -U nova -d nova_chat

shell-redis: ## Redis CLI
	docker compose exec redis redis-cli

# ─── Reset ───────────────────────────────────────────────────────────────────

reset-db: ## DIQQAT: Barcha ma'lumotlarni o'chiradi va qaytadan boshlaydi
	@echo "⚠️  DIQQAT: Barcha ma'lumotlar o'chadi! Davom etasizmi? [y/N]"
	@read ans; [ "$$ans" = "y" ] || exit 1
	docker compose down -v
	docker compose up -d postgres minio redis rabbitmq
	@sleep 10
	docker compose up -d
	@sleep 8
	$(MAKE) migrate seed audio-upload
	@echo "✅ Tizim qayta boshlandi"

clean: ## Docker image'lar va volumelarni tozalash (DIQQAT!)
	docker compose down -v --rmi local
	@echo "✅ Tozalandi"
