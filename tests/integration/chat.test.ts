/**
 * Chat + Media Service integration tests
 * Run: BASE_URL=http://localhost:80/api/v1 CUSTOMER_TOKEN=<jwt> npx jest tests/integration/chat.test.ts
 */
import axios from 'axios';

const BASE = process.env.BASE_URL ?? 'http://localhost:80/api/v1';
const TOKEN = process.env.CUSTOMER_TOKEN ?? '';

const http = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
});

describe('Chat Service', () => {
  let roomId: string;
  let messageId: string;

  describe('POST /support/request', () => {
    it('creates or returns existing support room', async () => {
      const res = await http.post('/support/request', { subject: 'Integration test' });
      if (!TOKEN) { expect(res.status).toBe(401); return; }
      expect([200, 201, 409]).toContain(res.status);
      if (res.status === 409) {
        expect(res.data).toBeDefined();
      } else {
        expect(res.data.roomId ?? res.data.id).toBeTruthy();
      }
    });
  });

  describe('GET /rooms', () => {
    it('returns rooms list', async () => {
      const res = await http.get('/rooms', { params: { limit: 10 } });
      if (!TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      if (res.data.items.length > 0) {
        roomId = res.data.items[0].id;
        expect(roomId).toBeTruthy();
      }
    });
  });

  describe('GET /rooms/:id/messages', () => {
    it('returns messages for a room', async () => {
      if (!roomId) return;
      const res = await http.get(`/rooms/${roomId}/messages`, { params: { limit: 20 } });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      if (res.data.items.length > 0) messageId = res.data.items[0].id;
    });
  });

  describe('POST /rooms/:id/messages', () => {
    it('sends a text message', async () => {
      if (!roomId) return;
      const res = await http.post(`/rooms/${roomId}/messages`, {
        type: 'text',
        content: 'Integration test message ' + Date.now(),
      });
      expect([200, 201]).toContain(res.status);
      if (res.status === 201 || res.status === 200) {
        expect(res.data.id).toBeTruthy();
        expect(res.data.type).toBe('text');
      }
    });
  });

  describe('POST /rooms/:id/typing', () => {
    it('sends typing event', async () => {
      if (!roomId) return;
      const res = await http.post(`/rooms/${roomId}/typing`, { typing: true });
      expect([200, 201, 204]).toContain(res.status);
    });
  });

  describe('POST /messages/:id/read', () => {
    it('marks message as read', async () => {
      if (!messageId) return;
      const res = await http.post(`/messages/${messageId}/read`);
      expect([200, 201, 204]).toContain(res.status);
    });
  });

  describe('GET /search', () => {
    it('searches messages via Meilisearch', async () => {
      const res = await http.get('/search', { params: { q: 'test', limit: 5 } });
      if (!TOKEN) { expect(res.status).toBe(401); return; }
      expect([200, 503]).toContain(res.status); // 503 if meilisearch not indexed yet
      if (res.status === 200) {
        expect(res.data.hits).toBeDefined();
      }
    });
  });
});

describe('Media Service', () => {
  describe('POST /media/presign', () => {
    it('returns uploadId and uploadUrl for valid file', async () => {
      const res = await http.post('/media/presign', {
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10000,
      });
      if (!TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(200);
      expect(res.data.uploadId).toBeTruthy();
      expect(res.data.uploadUrl).toContain('http');
    });

    it('rejects disallowed MIME type', async () => {
      const res = await http.post('/media/presign', {
        fileName: 'test.exe',
        mimeType: 'application/x-msdownload',
        fileSize: 1000,
      });
      if (!TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(400);
    });

    it('rejects oversized file', async () => {
      const res = await http.post('/media/presign', {
        fileName: 'huge.jpg',
        mimeType: 'image/jpeg',
        fileSize: 200 * 1024 * 1024,
      });
      if (!TOKEN) { expect(res.status).toBe(401); return; }
      expect(res.status).toBe(400);
    });
  });
});
