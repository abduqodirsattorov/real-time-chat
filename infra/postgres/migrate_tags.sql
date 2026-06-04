-- Migration: Room tags (suhbat teglari)
-- Adds: tags table (product-scoped) + rooms.tag_ids column

-- 1. tags catalog — admin sozlaydigan teglar ro'yxati
CREATE TABLE IF NOT EXISTS tags (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        VARCHAR(64) NOT NULL,
  color       VARCHAR(16) NOT NULL DEFAULT '#6B7280',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_product ON tags(product_id);

-- 2. rooms.tag_ids — room'ga qo'yilgan teg ID'lari
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tag_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_rooms_tag_ids ON rooms USING GIN (tag_ids);

-- Default teglar (Asosiy product uchun)
INSERT INTO tags (product_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000002', 'O''tkazma',    '#EF4444'),
  ('00000000-0000-0000-0000-000000000002', 'Karta',        '#3B82F6'),
  ('00000000-0000-0000-0000-000000000002', 'Hisob',        '#10B981'),
  ('00000000-0000-0000-0000-000000000002', 'Shoshilinch',  '#F59E0B'),
  ('00000000-0000-0000-0000-000000000002', 'Qayta ko''rib', '#8B5CF6')
ON CONFLICT (product_id, name) DO NOTHING;
