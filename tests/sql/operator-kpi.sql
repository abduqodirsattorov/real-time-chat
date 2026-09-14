-- Run after init.sql with psql -v ON_ERROR_STOP=1. Fixtures are rolled back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';

INSERT INTO users (id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', 'operator'),
  ('10000000-0000-4000-8000-000000000002', 'operator');

INSERT INTO calls (id, callee_id, direction, status, initiated_at, talk_duration_ms, queue_wait_ms) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'inbound', 'completed', '2026-01-01T10:00:00Z', 1000, 100),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'inbound', 'no_answer', '2026-01-01T11:00:00Z', 3000, 300),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'inbound', 'completed', '2026-01-02T10:00:00Z', 5000, 500);

INSERT INTO call_transfers (call_id, from_operator, to_operator, type, initiated_at) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'cold', '2026-01-01T10:01:00Z'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'warm', '2026-01-01T11:01:00Z'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'cold', '2026-01-01T10:02:00Z');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM v_operator_kpi_daily
    WHERE operator_id = '10000000-0000-4000-8000-000000000001' AND day = '2026-01-01'
      AND total_calls = 2 AND completed_calls = 1 AND missed_calls = 1
      AND avg_talk_duration_ms = 2000 AND avg_queue_wait_ms = 200 AND transfers_made = 2
  ) THEN
    RAISE EXCEPTION 'Daily KPI aggregation or operator transfer isolation failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM v_operator_kpi_daily
    WHERE operator_id = '10000000-0000-4000-8000-000000000001' AND day = '2026-01-02'
      AND total_calls = 1 AND completed_calls = 1 AND missed_calls = 0 AND transfers_made = 0
  ) THEN
    RAISE EXCEPTION 'Daily KPI date isolation or zero-transfer handling failed';
  END IF;
END $$;
ROLLBACK;
