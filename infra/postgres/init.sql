-- Nova Chat & Call Platform — Database Schema
-- PostgreSQL 16 + TimescaleDB
-- Version: 1.1

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('customer', 'operator', 'supervisor', 'admin', 'bot');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE user_locale AS ENUM ('uz', 'ru');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id   VARCHAR(64) UNIQUE,
  phone         VARCHAR(32) UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  full_name     VARCHAR(255),
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'customer',
  status        user_status NOT NULL DEFAULT 'active',
  locale        user_locale NOT NULL DEFAULT 'uz',
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role) WHERE status = 'active';
CREATE INDEX idx_users_external ON users(external_id);
CREATE INDEX idx_users_phone ON users(phone) WHERE status = 'active';

-- ── Devices (push tokens) ──────────────────────────────────────────────────────
CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web');

CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      device_platform NOT NULL,
  push_token    TEXT NOT NULL,
  voip_token    TEXT,
  device_name   VARCHAR(255),
  app_version   VARCHAR(32),
  locale        user_locale,
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, push_token)
);

CREATE INDEX idx_devices_user ON devices(user_id);

-- ── Products (tenants) ─────────────────────────────────────────────────────────
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(64)  NOT NULL,
  branding    JSONB        NOT NULL DEFAULT '{}',
  settings    JSONB        NOT NULL DEFAULT '{}',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (slug)
);

INSERT INTO products (id, name, slug, branding, settings)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Asosiy',
  'default',
  '{"display_name":"Asosiy","primary_color":"#3B6FF5","logo_url":null}',
  '{}'
);

-- ── Tags (product-scoped, admin sozlaydi) ─────────────────────────────────────
CREATE TABLE tags (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        VARCHAR(64) NOT NULL,
  color       VARCHAR(16) NOT NULL DEFAULT '#6B7280',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, name)
);
CREATE INDEX idx_tags_product ON tags(product_id);

INSERT INTO tags (product_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000002', 'O''tkazma',     '#EF4444'),
  ('00000000-0000-0000-0000-000000000002', 'Karta',         '#3B82F6'),
  ('00000000-0000-0000-0000-000000000002', 'Hisob',         '#10B981'),
  ('00000000-0000-0000-0000-000000000002', 'Shoshilinch',   '#F59E0B'),
  ('00000000-0000-0000-0000-000000000002', 'Qayta ko''rib', '#8B5CF6');

-- ── Rooms ──────────────────────────────────────────────────────────────────────
CREATE TYPE room_type AS ENUM ('direct', 'support', 'transfer_consult');
CREATE TYPE room_status AS ENUM ('open', 'closed', 'pending', 'bot_handling');

CREATE TABLE rooms (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id           UUID REFERENCES products(id),
  type                 room_type NOT NULL,
  status               room_status NOT NULL DEFAULT 'open',
  title                VARCHAR(255),
  customer_id          UUID REFERENCES users(id),
  operator_id          UUID REFERENCES users(id),
  previous_operator_id UUID REFERENCES users(id),
  last_message_at      TIMESTAMPTZ,
  bot_handled          BOOLEAN DEFAULT FALSE,
  escalated_at         TIMESTAMPTZ,
  metadata             JSONB DEFAULT '{}',
  tag_ids              UUID[]      NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ
);

CREATE INDEX idx_rooms_customer ON rooms(customer_id);
CREATE INDEX idx_rooms_operator ON rooms(operator_id) WHERE status = 'open';
CREATE INDEX idx_rooms_status ON rooms(status, last_message_at DESC);
CREATE INDEX idx_rooms_product ON rooms(product_id);
CREATE INDEX idx_rooms_tag_ids ON rooms USING GIN (tag_ids);

CREATE TABLE room_members (
  room_id              UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at              TIMESTAMPTZ,
  last_read_message_id UUID,
  muted                BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (room_id, user_id)
);

-- ── Messages (TimescaleDB hypertable) ──────────────────────────────────────────
CREATE TYPE message_type AS ENUM (
  'text', 'image', 'video', 'audio', 'file', 'voice',
  'system', 'call_log',
  'bot_card', 'bot_quick_reply'
);

CREATE TABLE messages (
  id             UUID NOT NULL DEFAULT uuid_generate_v4(),
  room_id        UUID NOT NULL,
  sender_id      UUID NOT NULL,
  type           message_type NOT NULL DEFAULT 'text',
  content        TEXT,
  content_locale user_locale,
  attachment_id  UUID,
  reply_to_id    UUID,
  edited_at      TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
);

SELECT create_hypertable('messages', 'created_at', chunk_time_interval => INTERVAL '7 days');
CREATE INDEX idx_messages_room ON messages(room_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC);

-- ── Receipts ───────────────────────────────────────────────────────────────────
CREATE TABLE message_receipts (
  message_id    UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  PRIMARY KEY (message_id, user_id)
);

-- ── System message templates (i18n) ───────────────────────────────────────────
CREATE TABLE system_message_templates (
  key           VARCHAR(64) PRIMARY KEY,
  template_uz   TEXT NOT NULL,
  template_ru   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_message_templates (key, template_uz, template_ru) VALUES
  ('operator.joined',
   'Operator {name} suhbatga qo''shildi',
   'Оператор {name} присоединился к чату'),
  ('operator.left',
   'Operator {name} suhbatdan chiqdi',
   'Оператор {name} покинул чат'),
  ('transfer.started',
   'Sizni boshqa operatorga ulanmoqda...',
   'Вас переключают на другого оператора...'),
  ('transfer.completed',
   'Endi operator {name} sizga yordam beradi',
   'Теперь оператор {name} помогает вам'),
  ('call.recording.started',
   'Bu qo''ng''iroq sifat nazorati uchun yozilmoqda',
   'Этот звонок записывается в целях контроля качества'),
  ('call.recording.stopped',
   'Yozish to''xtatildi',
   'Запись остановлена'),
  ('call.queued',
   'Operator topilmoqda, kuting...',
   'Поиск оператора, подождите...'),
  ('call.no_operator',
   'Hozircha bo''sh operator yo''q. Iltimos, keyinroq qayta urinib ko''ring',
   'Сейчас нет свободных операторов. Попробуйте позже'),
  ('room.closed',
   'Suhbat yopildi',
   'Чат закрыт'),
  ('bot.handoff',
   'Operator bilan ulanyapsiz...',
   'Соединяю с оператором...');

-- ── Attachments ────────────────────────────────────────────────────────────────
CREATE TABLE attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id   UUID NOT NULL REFERENCES users(id),
  storage_key   VARCHAR(512) NOT NULL,
  mime_type     VARCHAR(128) NOT NULL,
  file_name     VARCHAR(512) NOT NULL,
  size_bytes    BIGINT NOT NULL,
  width         INT,
  height        INT,
  duration_ms   INT,
  thumbnail_key VARCHAR(512),
  checksum      VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Operator states ────────────────────────────────────────────────────────────
CREATE TYPE operator_status AS ENUM (
  'offline', 'available', 'busy', 'away', 'on_call', 'in_transfer'
);

CREATE TABLE operator_states (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status               operator_status NOT NULL DEFAULT 'offline',
  active_chats         INT NOT NULL DEFAULT 0,
  max_concurrent_chats INT NOT NULL DEFAULT 5,
  on_call              BOOLEAN NOT NULL DEFAULT FALSE,
  current_call_id      UUID,
  current_product_id   UUID REFERENCES products(id),
  last_status_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  skills               TEXT[] DEFAULT '{}',
  languages            user_locale[] DEFAULT '{uz}',
  is_supervisor        BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_operator_states_status ON operator_states(status) WHERE status != 'offline';

-- ── Calls (CDR) ────────────────────────────────────────────────────────────────
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound', 'internal');
CREATE TYPE call_status AS ENUM (
  'initiating', 'ringing', 'queued', 'connected',
  'on_hold', 'transferring',
  'completed', 'failed', 'no_answer', 'canceled'
);

CREATE TABLE calls (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id          UUID REFERENCES products(id),
  caller_id           UUID REFERENCES users(id),
  callee_id           UUID REFERENCES users(id),
  direction           call_direction NOT NULL,
  status              call_status NOT NULL DEFAULT 'initiating',
  livekit_room        VARCHAR(255),
  queue_wait_ms       INT,
  ring_duration_ms    INT,
  talk_duration_ms    INT,
  hangup_cause        VARCHAR(64),
  hangup_by           UUID REFERENCES users(id),
  recording_id        UUID,
  metadata            JSONB DEFAULT '{}',
  initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at         TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ
);

CREATE INDEX idx_calls_caller ON calls(caller_id, initiated_at DESC);
CREATE INDEX idx_calls_callee ON calls(callee_id, initiated_at DESC);
CREATE INDEX idx_calls_status ON calls(status)
  WHERE status IN ('queued', 'ringing', 'connected', 'on_hold');
CREATE INDEX idx_calls_product ON calls(product_id);

-- ── Call transfers ─────────────────────────────────────────────────────────────
CREATE TYPE transfer_type AS ENUM ('cold', 'warm');
CREATE TYPE transfer_status AS ENUM (
  'initiated', 'consulting', 'completed', 'failed', 'canceled'
);

CREATE TABLE call_transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  from_operator   UUID NOT NULL REFERENCES users(id),
  to_operator     UUID NOT NULL REFERENCES users(id),
  type            transfer_type NOT NULL,
  status          transfer_status NOT NULL DEFAULT 'initiated',
  consult_room    VARCHAR(255),
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_call_transfers_call ON call_transfers(call_id);

-- ── Call queue ─────────────────────────────────────────────────────────────────
CREATE TABLE call_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id           UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  priority          SMALLINT NOT NULL DEFAULT 0,
  required_skills   TEXT[] DEFAULT '{}',
  required_language user_locale,
  enqueued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at       TIMESTAMPTZ,
  assigned_to       UUID REFERENCES users(id)
);

CREATE INDEX idx_queue_pending
  ON call_queue(priority DESC, enqueued_at ASC) WHERE assigned_at IS NULL;

-- ── Recordings ─────────────────────────────────────────────────────────────────
CREATE TYPE recording_status AS ENUM (
  'starting', 'active', 'processing', 'completed', 'failed'
);

CREATE TABLE recordings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id           UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  started_by        UUID NOT NULL REFERENCES users(id),
  consent_announced BOOLEAN NOT NULL DEFAULT FALSE,
  status            recording_status NOT NULL DEFAULT 'starting',
  storage_key       VARCHAR(512),
  duration_ms       INT,
  size_bytes        BIGINT,
  egress_id         VARCHAR(255),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at        TIMESTAMPTZ,
  failed_reason     TEXT
);

CREATE INDEX idx_recordings_call ON recordings(call_id);

-- ── Customers (mijoz profil) ───────────────────────────────────────────────────
CREATE TABLE customers (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  external_uid VARCHAR(128),
  profile_data JSONB       NOT NULL DEFAULT '{}',
  notes        TEXT,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, user_id),
  UNIQUE (product_id, external_uid)
);

CREATE INDEX idx_customers_product ON customers(product_id);
CREATE INDEX idx_customers_user    ON customers(user_id);
CREATE INDEX idx_customers_ext_uid ON customers(product_id, external_uid);

CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_customers_updated_at();

-- ── Operator ↔ Product permissions ────────────────────────────────────────────
CREATE TABLE operator_products (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX idx_operator_products_user    ON operator_products(user_id);
CREATE INDEX idx_operator_products_product ON operator_products(product_id);

-- ── Audit log ──────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES users(id),
  action        VARCHAR(128) NOT NULL,
  target_type   VARCHAR(64),
  target_id     UUID,
  payload       JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

-- ── Transactions (Nova transfer, universal JSONB) ─────────────────────────────
CREATE TABLE transactions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_id  VARCHAR(128),
  user_uid     VARCHAR(128),
  data         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, external_id)
);

CREATE INDEX idx_transactions_product    ON transactions(product_id, created_at DESC);
CREATE INDEX idx_transactions_user_uid   ON transactions(product_id, user_uid);

CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_transactions_updated_at();

-- ── Bot configs (PHASE 10 stub) ────────────────────────────────────────────────
CREATE TABLE bot_configs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(128) NOT NULL,
  type              VARCHAR(32) NOT NULL,
  enabled           BOOLEAN DEFAULT FALSE,
  config            JSONB DEFAULT '{}',
  fallback_to_human BOOLEAN DEFAULT TRUE,
  handoff_keywords  TEXT[] DEFAULT ARRAY['operator', 'оператор', 'odam', 'человек'],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── KPI Views ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_operator_kpi_daily AS
SELECT
  c.callee_id AS operator_id,
  DATE(c.initiated_at) AS day,
  COUNT(*) AS total_calls,
  AVG(c.talk_duration_ms) AS avg_talk_duration_ms,
  AVG(c.queue_wait_ms) AS avg_queue_wait_ms,
  COUNT(*) FILTER (WHERE c.status = 'completed') AS completed_calls,
  COUNT(*) FILTER (WHERE c.status = 'no_answer') AS missed_calls,
  (
    SELECT COUNT(*) FROM call_transfers t
    WHERE t.from_operator = c.callee_id
      AND DATE(t.initiated_at) = DATE(c.initiated_at)
  ) AS transfers_made
FROM calls c
WHERE c.callee_id IS NOT NULL
GROUP BY c.callee_id, DATE(c.initiated_at);

CREATE OR REPLACE VIEW v_chat_first_response AS
SELECT
  m.room_id,
  EXTRACT(EPOCH FROM (
    MIN(m.created_at) FILTER (WHERE u.role IN ('operator', 'supervisor'))
    - MIN(m.created_at) FILTER (WHERE u.role = 'customer')
  )) * 1000 AS first_response_ms
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.type IN ('text', 'image', 'video', 'file')
GROUP BY m.room_id;

-- ── Triggers ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rooms SET last_message_at = NEW.created_at WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_update_room
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_room_last_message();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Dev seed: system user (system messages uchun) ─────────────────────────────
INSERT INTO users (id, external_id, full_name, role, status, locale)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system',
  'System',
  'bot',
  'active',
  'uz'
) ON CONFLICT DO NOTHING;
