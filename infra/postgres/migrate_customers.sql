-- Migration: customers profil jadval
-- Run: docker compose exec -T postgres psql -U nova nova_chat < infra/postgres/migrate_customers.sql

CREATE TABLE IF NOT EXISTS customers (
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

CREATE INDEX IF NOT EXISTS idx_customers_product    ON customers(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_user       ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_ext_uid    ON customers(product_id, external_uid);

CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_customers_updated_at();

-- Mavjud rooms'dan customer yozuvlar avtomatik yaratilmaydi —
-- birinchi marta room ochilganda upsert bilan yaratiladi.
