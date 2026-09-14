-- Explicit test-only setup. Never run against production.
-- Requires a fresh database initialized with infra/postgres/init.sql.
BEGIN;
INSERT INTO users (email, password_hash, full_name, role, status, locale)
VALUES ('admin@pusher.uz', crypt('Admin12345', gen_salt('bf', 10)), 'Test Admin', 'admin', 'active', 'uz')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (phone, full_name, role, status, locale) VALUES
  ('+998900000001', 'Test Customer', 'customer', 'active', 'uz'),
  ('+998900000002', 'Test Operator', 'operator', 'active', 'uz')
ON CONFLICT (phone) DO NOTHING;

INSERT INTO operator_products (user_id, product_id)
SELECT id, '00000000-0000-0000-0000-000000000002' FROM users
WHERE phone = '+998900000002' AND role = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO operator_states (user_id, current_product_id)
SELECT id, '00000000-0000-0000-0000-000000000002' FROM users
WHERE phone = '+998900000002' AND role = 'operator'
ON CONFLICT DO NOTHING;
COMMIT;
