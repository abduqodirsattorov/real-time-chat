-- Field configs: har product uchun qaysi maydon ko'rinsin
-- context: tx_table | tx_detail | profile
-- display_type: text | date | badge | amount

CREATE TABLE IF NOT EXISTS field_configs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  context      VARCHAR(32) NOT NULL,
  field_key    VARCHAR(128) NOT NULL,
  label        VARCHAR(255) NOT NULL,
  visible      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order   INT         NOT NULL DEFAULT 0,
  display_type VARCHAR(32) NOT NULL DEFAULT 'text',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, context, field_key)
);

CREATE INDEX IF NOT EXISTS idx_field_configs_product_ctx
  ON field_configs(product_id, context);

CREATE OR REPLACE FUNCTION trg_field_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_configs_updated_at ON field_configs;
CREATE TRIGGER trg_field_configs_updated_at
  BEFORE UPDATE ON field_configs
  FOR EACH ROW EXECUTE FUNCTION trg_field_configs_updated_at();

-- Default configs for the default product
-- tx_table: tranzaksiya jadval ustunlari
INSERT INTO field_configs (product_id, context, field_key, label, visible, sort_order, display_type)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'debit_state',     'Debit holati',      TRUE,  0,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'credit_state',    'Kredit holati',     TRUE,  1,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'service',         'Servis',            TRUE,  2,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'debit_amount',    'Debit summa',       TRUE,  3,  'amount'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'credit_amount',   'Kredit summa',      TRUE,  4,  'amount'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'paid_at',         'To''lab berilgan',  TRUE,  5,  'date'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'provider',        'Provayder',         FALSE, 6,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'type',            'Tur',               FALSE, 7,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'strana',          'Strana',            FALSE, 8,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'ext_debit_state', 'Ext debit',         FALSE, 9,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_table', 'ext_credit_state','Ext kredit',        FALSE, 10, 'badge')
ON CONFLICT (product_id, context, field_key) DO NOTHING;

-- tx_detail: tranzaksiya detal paneli top maydonlari
INSERT INTO field_configs (product_id, context, field_key, label, visible, sort_order, display_type)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'debit_state',      'Debit holati',      TRUE,  0,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'credit_state',     'Kredit holati',     TRUE,  1,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'ext_debit_state',  'Ext debit',         TRUE,  2,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'ext_credit_state', 'Ext kredit',        TRUE,  3,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'amount',           'Summa',             TRUE,  4,  'amount'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'debit_amount',     'Debit summa',       TRUE,  5,  'amount'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'credit_amount',    'Kredit summa',      TRUE,  6,  'amount'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'currency',         'Valyuta',           TRUE,  7,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'service',          'Servis',            TRUE,  8,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'provider',         'Provayder',         TRUE,  9,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'type',             'Tur',               TRUE,  10, 'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'strana',           'Strana',            TRUE,  11, 'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'phone',            'Telefon',           TRUE,  12, 'text'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'paid_at',          'To''lab berilgan',  TRUE,  13, 'date'),
  ('00000000-0000-0000-0000-000000000002', 'tx_detail', 'fiscal_number',    'Fiskal raqam',      FALSE, 14, 'text')
ON CONFLICT (product_id, context, field_key) DO NOTHING;

-- profile: mijoz profil paneli maydonlari
INSERT INTO field_configs (product_id, context, field_key, label, visible, sort_order, display_type)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'profile', 'phone',       'Telefon',             TRUE,  0,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'full_name',   'Ismi',                TRUE,  1,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'passport',    'Pasport',             TRUE,  2,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'nationality', 'Millat',              TRUE,  3,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'birthdate',   'Tug''ilgan sana',     TRUE,  4,  'date'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'language',    'Til',                 TRUE,  5,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'uid',         'UID',                 TRUE,  6,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'citizenship', 'Fuqarolik',           TRUE,  7,  'text'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'identified',  'Identifikatsiya',     TRUE,  8,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'is_blocked',  'Bloklangan',          FALSE, 9,  'badge'),
  ('00000000-0000-0000-0000-000000000002', 'profile', 'created',     'Ro''yxatdan o''tgan', TRUE,  10, 'date')
ON CONFLICT (product_id, context, field_key) DO NOTHING;
