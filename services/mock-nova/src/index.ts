import express, { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

const app = express();
app.use(express.json());

const API_KEY = process.env.MOCK_NOVA_API_KEY ?? 'nova_api_key_change_me';
const HMAC_SECRET = process.env.MOCK_NOVA_HMAC_SECRET ?? 'nova_hmac_secret_change_me_32c';
const PORT = parseInt(process.env.PORT ?? '3009', 10);

// Per-key fail-once counters for retry testing
const failOnceMap = new Map<string, true>();

// ── HMAC verification middleware ─────────────────────────────────────────────

function verifyHmac(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];
  const signature = req.headers['x-signature'] as string | undefined;

  if (apiKey !== API_KEY) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  if (!signature) {
    res.status(401).json({ error: 'Missing X-Signature header' });
    return;
  }

  // GET → sign empty string; POST → sign JSON body
  const bodyStr = req.method === 'GET' ? '' : JSON.stringify(req.body ?? {});
  const expected = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(bodyStr)
    .digest('hex');

  let valid = false;
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(401).json({ error: 'Invalid HMAC signature' });
    return;
  }

  next();
}

// ── Sample data ───────────────────────────────────────────────────────────────

const PROFILES: Record<string, object> = {
  uid_test_001: {
    user_uid: 'uid_test_001',
    full_name: 'Alisher Umarov',
    phone: '+998901234567',
    passport: 'AA1234567',
    nationality: 'Uzbek',
    birth_date: '1990-05-15',
    language: 'uz',
    citizenship: 'UZ',
    is_identified: true,
    is_blocked: false,
    registered_at: '2023-01-15T10:00:00Z',
    email: 'alisher@example.com',
  },
  uid_test_002: {
    user_uid: 'uid_test_002',
    full_name: 'Malika Rahimova',
    phone: '+998909876543',
    passport: 'BB7654321',
    nationality: 'Uzbek',
    birth_date: '1995-08-20',
    language: 'uz',
    citizenship: 'UZ',
    is_identified: true,
    is_blocked: false,
    registered_at: '2023-06-10T12:00:00Z',
    email: null,
  },
};

const TRANSACTIONS = [
  {
    ext_id: 'TX-MOCK-001',
    user_uid: 'uid_test_001',
    phone: '+998901234567',
    provider: 'uzcard',
    type: 'transfer',
    debit_state: 'Ok',
    credit_state: 'Ok',
    debit_amount: 150000,
    credit_amount: 150000,
    strana: 'UZ',
    created_at: '2026-06-01T10:00:00Z',
    paid_at: '2026-06-01T10:01:00Z',
    fiscal_number: 'F-001',
  },
  {
    ext_id: 'TX-MOCK-002',
    user_uid: 'uid_test_001',
    phone: '+998901234567',
    provider: 'humo',
    type: 'payment',
    debit_state: 'Wait',
    credit_state: 'Pending',
    debit_amount: 75000,
    credit_amount: 75000,
    strana: 'UZ',
    created_at: '2026-06-02T14:30:00Z',
    paid_at: null,
    fiscal_number: 'F-002',
  },
  {
    ext_id: 'TX-MOCK-003',
    user_uid: 'uid_test_002',
    phone: '+998909876543',
    provider: 'visa',
    type: 'transfer',
    debit_state: 'Fail',
    credit_state: 'Cancel',
    debit_amount: 200000,
    credit_amount: 200000,
    strana: 'RU',
    created_at: '2026-06-03T09:15:00Z',
    paid_at: null,
    fiscal_number: 'F-003',
  },
];

const ACTIONS_MAP: Record<string, object[]> = {
  'TX-MOCK-001': [
    { key: 'refresh_status', label: 'Statuslarni qayta olish', enabled: true },
    { key: 'send_message', label: 'Xabar yuborish', enabled: true },
    { key: 'recredit_p2p', label: 'Recredit (P2P)', enabled: false, reason: 'Allaqachon muvaffaqiyatli' },
    { key: 'refund_cash', label: 'Pulni qaytarish', enabled: false, reason: 'Supervisor ruxsati kerak' },
    { key: 'export_csv', label: 'Export CSV', enabled: true },
  ],
  'TX-MOCK-002': [
    { key: 'refresh_status', label: 'Statuslarni qayta olish', enabled: true },
    { key: 'send_message', label: 'Xabar yuborish', enabled: true },
    { key: 'recredit_p2p', label: 'Recredit (P2P)', enabled: true },
    { key: 'recredit_payment', label: 'Recredit (Payment)', enabled: true },
    { key: 'refund_cash', label: 'Pulni qaytarish', enabled: false, reason: 'Kutilmoqda holati' },
    { key: 'export_csv', label: 'Export CSV', enabled: true },
  ],
  'TX-MOCK-003': [
    { key: 'refresh_status', label: 'Statuslarni qayta olish', enabled: true },
    { key: 'send_message', label: 'Xabar yuborish', enabled: true },
    { key: 'recredit_p2p', label: 'Recredit (P2P)', enabled: true },
    { key: 'refund_cash', label: 'Pulni qaytarish', enabled: true },
    { key: 'export_csv', label: 'Export CSV', enabled: true },
  ],
};

const DEFAULT_ACTIONS = [
  { key: 'refresh_status', label: 'Statuslarni qayta olish', enabled: true },
  { key: 'send_message', label: 'Xabar yuborish', enabled: true },
  { key: 'export_csv', label: 'Export CSV', enabled: true },
];

// ── Routes ────────────────────────────────────────────────────────────────────

// Health — no auth needed
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mock-nova' });
});

// Retry test helper — no auth (internal use only)
// POST /test/fail-once/:key  → next request to actions for this ext_id returns 503 once
app.post('/test/fail-once/:key', (req, res) => {
  failOnceMap.set(req.params.key, true);
  res.json({ ok: true, key: req.params.key });
});

// ── Protected endpoints (HMAC required) ──────────────────────────────────────

app.use('/api', verifyHmac);

// GET /api/support/profile/:user_uid
app.get('/api/support/profile/:user_uid', (req, res) => {
  const profile = PROFILES[req.params.user_uid];
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(profile);
});

// GET /api/support/transactions
app.get('/api/support/transactions', (req, res) => {
  const { user_uid, provider, type, date_from, date_to, page = '1', limit = '20' } =
    req.query as Record<string, string>;

  let items = [...TRANSACTIONS];
  if (user_uid) items = items.filter(t => t.user_uid === user_uid);
  if (provider) items = items.filter(t => t.provider === provider);
  if (type) items = items.filter(t => t.type === type);
  if (date_from) items = items.filter(t => t.created_at >= date_from);
  if (date_to) items = items.filter(t => t.created_at <= date_to);

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const paged = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.json({ items: paged, total: items.length, page: pageNum });
});

// GET /api/support/transaction/:ext_id
app.get('/api/support/transaction/:ext_id', (req, res) => {
  const tx = TRANSACTIONS.find(t => t.ext_id === req.params.ext_id);
  if (!tx) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  res.json(tx);
});

// GET /api/support/transaction/:ext_id/actions
// Supports fail-once for retry testing
app.get('/api/support/transaction/:ext_id/actions', (req, res) => {
  const { ext_id } = req.params;

  if (failOnceMap.has(ext_id)) {
    failOnceMap.delete(ext_id);
    res.status(503).json({ error: 'Service temporarily unavailable (retry test)' });
    return;
  }

  const actions = ACTIONS_MAP[ext_id] ?? DEFAULT_ACTIONS;
  res.json({ actions });
});

// POST /api/support/transaction/:ext_id/action
app.post('/api/support/transaction/:ext_id/action', (req, res) => {
  const { ext_id } = req.params;
  const { action, operator_id, params: actionParams } = req.body ?? {};

  // Log without sensitive fields
  console.log(`[mock-nova] action: ${action} on ${ext_id} by ${operator_id}`);

  const txActions = ACTIONS_MAP[ext_id] as Array<{ key: string; enabled: boolean; reason?: string }> | undefined;
  const found = txActions?.find(a => a.key === action);

  if (found && !found.enabled) {
    res.status(409).json({ error: 'Action not allowed', reason: found.reason ?? '' });
    return;
  }

  res.json({
    success: true,
    result: {
      action,
      ext_id,
      operator_id,
      executed_at: new Date().toISOString(),
      params: actionParams ?? {},
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[mock-nova] running on port ${PORT}`);
  console.log(`[mock-nova] API_KEY configured: ${API_KEY !== 'nova_api_key_change_me' ? 'YES (custom)' : 'default'}`);
});
