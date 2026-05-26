/**
 * Nova Chat — Call storm load test
 * 200 parallel audio call initiatsiya
 * Ishlatish: k6 run tests/load/call-storm.js -e TOKEN=<operator_jwt>
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const callsInitiated = new Counter('calls_initiated');
const callsQueued = new Counter('calls_queued');
const callsFailed = new Counter('calls_failed');
const callLatency = new Trend('call_initiation_latency_ms');
const successRate = new Rate('call_success_rate');

export const options = {
  stages: [
    { duration: '20s', target: 50 },   // Boshlang'ich yuklanish
    { duration: '1m',  target: 200 },  // Peak: 200 parallel
    { duration: '30s', target: 0 },    // Tushirish
  ],
  thresholds: {
    'call_initiation_latency_ms': ['p95<500'],  // p95 < 500ms
    'call_success_rate': ['rate>0.95'],          // 95% success
    'http_req_failed': ['rate<0.05'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3005';
const TOKEN = __ENV.TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

export default function () {
  const startTime = Date.now();

  const res = http.post(
    `${API_URL}/calls/initiate`,
    JSON.stringify({ type: 'audio' }),
    { headers, timeout: '10s' },
  );

  callLatency.add(Date.now() - startTime);

  const ok = check(res, {
    'status 201 (connected) or 200 (queued)': (r) => r.status === 201 || r.status === 200,
    'not 5xx': (r) => r.status < 500,
  });

  if (res.status === 201) {
    callsInitiated.add(1);
    successRate.add(1);

    // Qo'ng'iroqni darhol to'xtatamiz (test uchun)
    const body = JSON.parse(res.body);
    if (body.call_id) {
      http.post(
        `${API_URL}/calls/${body.call_id}/hangup`,
        '{}',
        { headers },
      );
    }
  } else if (res.status === 200) {
    callsQueued.add(1);
    successRate.add(1);
  } else {
    callsFailed.add(1);
    successRate.add(0);
  }

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'tests/load/results/call-storm-summary.json': JSON.stringify(data, null, 2),
  };
}
