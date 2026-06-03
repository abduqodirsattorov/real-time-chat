-- 2-BOSQICH: Transactions jadval migration
-- Xavfsiz: IF NOT EXISTS ishlatiladi

CREATE TABLE IF NOT EXISTS transactions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_id  VARCHAR(128),
  user_uid     VARCHAR(128),
  data         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_product
  ON transactions(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_uid
  ON transactions(product_id, user_uid);

CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_transactions_updated_at();
