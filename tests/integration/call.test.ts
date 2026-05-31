/**
 * Call Service integration tests
 * Run: BASE_URL=http://localhost:80/api/v1 CUSTOMER_TOKEN=<jwt> OPERATOR_TOKEN=<jwt> npx jest tests/integration/call.test.ts
 */
import axios from 'axios';

const BASE = process.env.BASE_URL ?? 'http://localhost:80/api/v1';
const CUSTOMER_TOKEN = process.env.CUSTOMER_TOKEN ?? '';
const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN ?? '';

const customerHttp = axios.create({
  baseURL: BASE, validateStatus: () => true,
  headers: CUSTOMER_TOKEN ? { Authorization: `Bearer ${CUSTOMER_TOKEN}` } : {},
});

const operatorHttp = axios.create({
  baseURL: BASE, validateStatus: () => true,
  headers: OPERATOR_TOKEN ? { Authorization: `Bearer ${OPERATOR_TOKEN}` } : {},
});

describe('Call Service', () => {
  let callId: string;

  describe('POST /calls/initiate (customer inbound)', () => {
    it('creates a call with status ringing or queued', async () => {
      const res = await customerHttp.post('/calls/initiate', { type: 'audio' });
      if (!CUSTOMER_TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(200);
      expect(res.data.call?.id).toBeTruthy();
      expect(['ringing', 'queued']).toContain(res.data.status);
      callId = res.data.call.id;
    });
  });

  describe('GET /calls', () => {
    it('returns call history for customer', async () => {
      const res = await customerHttp.get('/calls', { params: { limit: 5 } });
      if (!CUSTOMER_TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.calls)).toBe(true);
    });

    it('returns call history for operator', async () => {
      const res = await operatorHttp.get('/calls', { params: { limit: 5 } });
      if (!OPERATOR_TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.calls)).toBe(true);
    });
  });

  describe('GET /calls/:id', () => {
    it('returns call details', async () => {
      if (!callId) return;
      const res = await customerHttp.get(`/calls/${callId}`);
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(callId);
    });
  });

  describe('POST /calls/:id/hangup', () => {
    it('cancels the call', async () => {
      if (!callId) return;
      const res = await customerHttp.post(`/calls/${callId}/hangup`);
      expect(res.status).toBe(200);
      expect(['completed', 'canceled', 'no_answer']).toContain(res.data.status);
    });
  });

  describe('POST /calls/outbound (operator)', () => {
    it('requires operator role', async () => {
      const res = await customerHttp.post('/calls/outbound', {
        calleeId: '00000000-0000-0000-0000-000000000001',
      });
      if (!CUSTOMER_TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(403);
    });
  });
});
