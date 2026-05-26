/**
 * Nova Chat — Chat load test
 * 10,000 concurrent WebSocket connection
 * Ishlatish: k6 run tests/load/chat-flood.js -e TOKEN=<jwt>
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const msgReceived = new Counter('messages_received');
const msgLatency = new Trend('message_latency_ms');

export const options = {
  stages: [
    { duration: '30s', target: 1000 },   // Sekin ko'tarish
    { duration: '1m',  target: 5000 },   // O'rta yuklanish
    { duration: '2m',  target: 10000 },  // Peak: 10K connection
    { duration: '30s', target: 0 },      // Tushirish
  ],
  thresholds: {
    'message_latency_ms': ['p95<100'],   // p95 < 100ms
    'ws_connecting': ['p95<500'],         // WebSocket ulanish < 500ms
    'checks': ['rate>0.99'],              // 99% success
  },
};

const CENTRIFUGO_URL = __ENV.CENTRIFUGO_URL || 'ws://localhost:8000/connection/websocket';
const TOKEN = __ENV.TOKEN || '';
const ROOM_ID = __ENV.ROOM_ID || 'test-room-1';

export default function () {
  const url = `${CENTRIFUGO_URL}?token=${TOKEN}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Centrifugo connect
      socket.send(JSON.stringify({
        id: 1,
        connect: {
          token: TOKEN,
          name: `k6-user-${__VU}`,
          version: '0.0.1',
        },
      }));
    });

    socket.on('message', (raw) => {
      const data = JSON.parse(raw);

      // Connect ack → subscribe
      if (data.id === 1 && data.connect) {
        socket.send(JSON.stringify({
          id: 2,
          subscribe: {
            channel: `chat:room#${ROOM_ID}`,
          },
        }));
      }

      // Publication (xabar keldi)
      if (data.push && data.push.pub) {
        msgReceived.add(1);
        const now = Date.now();
        const sentAt = data.push.pub.data?.sent_at;
        if (sentAt) {
          msgLatency.add(now - sentAt);
        }
      }

      check(data, { 'no error': (d) => !d.error });
    });

    socket.on('error', (e) => {
      console.error(`VU ${__VU} WS error: ${e}`);
    });

    // 60 sekund ushlaymiz
    socket.setTimeout(() => socket.close(), 60000);
  });

  check(res, { 'WebSocket status 101': (r) => r && r.status === 101 });
  sleep(1);
}
