// Performance test for the ticket status/history API, through the API Gateway.
//   k6 run perf/ticket-history.k6.js            (or demo-progress3/perf-test.sh, which also saves the results)
//
// Workload: after a 15 s warm-up with 10 virtual users, 50 virtual users each read the history of one
// ticket in a loop for 60 s (no think time, so this is the worst case for 50 simultaneous clients, not
// "50 users"). Each request goes gateway -> JWT check -> gRPC GetTicketHistory -> PostgreSQL.
// Proposed criteria (only the steady phase counts): p95 latency < 1 s and error rate < 1 %.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '60s';
const PHOTO = open(__ENV.PHOTO || '../demo-progress2/photos/issue-1.png', 'b');

export const options = {
  scenarios: {
    warmup: { executor: 'constant-vus', vus: 10, duration: '15s', gracefulStop: '0s', tags: { phase: 'warmup' } },
    steady: { executor: 'constant-vus', vus: VUS, duration: DURATION, startTime: '15s', tags: { phase: 'steady' } },
  },
  thresholds: {
    'http_req_duration{phase:steady}': ['p(95)<1000'],
    'http_req_failed{phase:steady}': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Runs once: a fresh reporter account and one ticket that every virtual user then reads.
export function setup() {
  const run = Date.now();
  const credentials = { email: `perf-${run}@student.chula.ac.th`, password: `Perf-pass-${run}` };
  const json = { headers: { 'Content-Type': 'application/json' } };
  const registered = http.post(`${BASE}/auth/register`, JSON.stringify(credentials), json);
  if (registered.status !== 201) throw new Error(`register failed: ${registered.status} ${registered.body}`);
  const token = http.post(`${BASE}/auth/login`, JSON.stringify(credentials), json).json('accessToken');
  const ticket = http.post(
    `${BASE}/tickets`,
    {
      category: 'Electrical',
      location: 'ENG3 room 315',
      description: 'Performance test ticket',
      photos: http.file(PHOTO, 'issue-1.png', 'image/png'),
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (ticket.status !== 201) throw new Error(`create ticket failed: ${ticket.status} ${ticket.body}`);
  return { token, ticketId: ticket.json('id') };
}

export default function ({ token, ticketId }) {
  const response = http.get(`${BASE}/tickets/${ticketId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'GET /tickets/:id/history' },
  });
  check(response, {
    'status is 200': (r) => r.status === 200,
    'history is returned': (r) => r.status === 200 && Array.isArray(r.json('history')),
  });
}
