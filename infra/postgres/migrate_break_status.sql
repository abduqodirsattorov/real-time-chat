-- Operator status: 'break' (tanaffus/tushlik) qo'shish
-- Mavjud: offline, available, busy, away, on_call, in_transfer
-- Yangi: break

ALTER TYPE operator_status ADD VALUE IF NOT EXISTS 'break';

-- Tekshirish
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'operator_status'
ORDER BY enumsortorder;
