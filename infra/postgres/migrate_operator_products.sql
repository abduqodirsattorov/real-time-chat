-- Migration: operator_products — operator-product permission junction table
-- Run: docker compose exec -T postgres psql -U nova nova_chat < infra/postgres/migrate_operator_products.sql

CREATE TABLE IF NOT EXISTS operator_products (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_products_user    ON operator_products(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_products_product ON operator_products(product_id);

-- Existing operators get access to default product
INSERT INTO operator_products (user_id, product_id)
SELECT os.user_id, '00000000-0000-0000-0000-000000000002'
FROM operator_states os
ON CONFLICT DO NOTHING;
