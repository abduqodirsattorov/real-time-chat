-- ── Migration: Schema Drift Fixes ───────────────────────────────────────────────
-- 1. calls.operator_id
ALTER TABLE calls ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_calls_operator ON calls(operator_id);

-- 2. bot_configs.updated_at
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. operator_status: 'break'
ALTER TYPE operator_status ADD VALUE IF NOT EXISTS 'break';
