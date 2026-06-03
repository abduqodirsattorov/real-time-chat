-- Multi-tenancy migration: Phase 0
-- Run against existing DB: docker compose exec postgres psql -U nova nova_chat -f /docker-entrypoint-initdb.d/migrate_multitenancy.sql
-- OR: docker compose exec -T postgres psql -U nova nova_chat < infra/postgres/migrate_multitenancy.sql

-- 1. Products table (tenant)
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(64)  NOT NULL,
  branding    JSONB        NOT NULL DEFAULT '{}',
  settings    JSONB        NOT NULL DEFAULT '{}',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (slug)
);

-- 2. Default product (fixed UUID — safe to re-run)
INSERT INTO products (id, name, slug, branding, settings)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Asosiy',
  'default',
  '{"display_name":"Asosiy","primary_color":"#3B6FF5","logo_url":null}',
  '{}'
) ON CONFLICT (id) DO NOTHING;

-- 3. rooms.product_id
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
UPDATE rooms SET product_id = '00000000-0000-0000-0000-000000000002' WHERE product_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_product ON rooms(product_id);

-- 4. calls.product_id
ALTER TABLE calls ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
UPDATE calls SET product_id = '00000000-0000-0000-0000-000000000002' WHERE product_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_calls_product ON calls(product_id);

-- 5. operator_states.current_product_id
ALTER TABLE operator_states ADD COLUMN IF NOT EXISTS current_product_id UUID REFERENCES products(id);
UPDATE operator_states SET current_product_id = '00000000-0000-0000-0000-000000000002' WHERE current_product_id IS NULL;
