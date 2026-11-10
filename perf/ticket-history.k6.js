// npm run test:load | npm run test:stress | npm run test:perf
// Direct k6 usage also works; see docs/load-testing.md for environment options.
import http from 'k6/http';
import execution from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { configuration, profile, phaseAt, thresholds } from './lib/profile.js';
import { summarize, summaryText } from './lib/summary.js';

const config = configuration(__ENV);
const phases = profile(config);
const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const PHOTO = open('../demo-progress2/photos/issue-1.png', 'b');
const readLatency = new Trend('read_latency', true);
const readErrors = new Rate('read_errors');
const invalidContent = new Rate('read_invalid_content');
const readRequests = new Counter('read_requests');
const readTimeouts = new Counter('read_timeouts');
const params = { timeout: '5s', redirects: 0 };

export const options = {
  scenarios: {
    history: {
      executor: 'ramping-vus', startVUs: 0,
      stages: phases.map(p => ({ duration: `${p.seconds}s`, target: p.vus })),
      gracefulRampDown: '5s', gracefulStop: '5s',
    },
  },
  thresholds: thresholds(config, phases),
  setupTimeout: '180s',
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

function json(response, label, expected) {
  if (response.status !== expected) throw new Error(`${label}: expected HTTP ${expected}, got ${response.status}`);
  try { return response.json(); } catch { throw new Error(`${label}: invalid JSON`); }
}

export function setup() {
  json(http.get(`${BASE}/health/ready`, params), 'readiness', 200);
  const run = `${Date.now()}-${config.type}`;
  const reporters = [];
  for (let i = 0; i < config.reporters; i++) {
    const credentials = { email: `load-${run}-${i}@example.test`, password: `Load-test-${run}-${i}!` };
    const authParams = { ...params, headers: { 'Content-Type': 'application/json' } };
    json(http.post(`${BASE}/auth/register`, JSON.stringify(credentials), authParams), 'register', 201);
    const token = json(http.post(`${BASE}/auth/login`, JSON.stringify(credentials), authParams), 'login', 200).accessToken;
    if (typeof token !== 'string' || !token) throw new Error('login: missing token');
    const ticketIds = [];
    for (let j = 0; j < config.ticketsPerReporter; j++) {
      const ticket = json(http.post(`${BASE}/tickets`, {
        category: `Load test ${run}`, location: 'Engineering load-test fixture',
        description: `Load-test fixture ${i}/${j}`, photos: http.file(PHOTO, 'issue.png', 'image/png'),
      }, { ...params, headers: { Authorization: `Bearer ${token}` } }), 'create ticket', 201);
      if (typeof ticket.id !== 'string' || !ticket.id) throw new Error('create ticket: missing ID');
      ticketIds.push(ticket.id);
    }
    // Prove the fixture and ownership work before starting measured traffic.
    const ready = json(http.get(`${BASE}/tickets/${ticketIds[0]}/history`, {
      ...params, headers: { Authorization: `Bearer ${token}` },
    }), 'fixture history', 200);
    if (ready.ticket?.id !== ticketIds[0] || !Array.isArray(ready.history)) throw new Error('fixture history: unexpected content');
    reporters.push({ token, ticketIds });
  }
  return { reporters, readyAt: new Date().toISOString() };
}

export default function ({ reporters }) {
  const reporter = reporters[(execution.vu.idInTest - 1) % reporters.length];
  const id = reporter.ticketIds[execution.vu.iterationInScenario % reporter.ticketIds.length];
  // Attribute a request to the phase in which it started. Setup and ramps do not affect plateau SLOs.
  const phase = phaseAt(phases, (Date.now() - execution.scenario.startTime) / 1000);
  const tags = { phase, name: 'GET /tickets/:id/history' };
  const response = http.get(`${BASE}/tickets/${id}/history`, {
    ...params, tags, headers: { Authorization: `Bearer ${reporter.token}` },
  });
  let body;
  if (response.status === 200) { try { body = response.json(); } catch { /* Recorded as invalid content. */ } }
  const correct = response.status === 200 && body?.ticket?.id === id && Array.isArray(body?.history);
  check(response, { 'status is 200': r => r.status === 200, 'expected ticket/history': () => correct }, tags);
  readRequests.add(1, tags);
  readLatency.add(response.timings.duration, tags);
  readErrors.add(!correct, tags);
  invalidContent.add(response.status === 200 && !correct, tags);
  readTimeouts.add(response.error_code === 1050 ? 1 : 0, tags);
  sleep(config.thinkSeconds);
}

export function handleSummary(data) {
  const summary = summarize(data, config, phases);
  const directory = __ENV.RESULT_DIR || '.';
  return {
    stdout: summaryText(summary),
    [`${directory}/summary.json`]: JSON.stringify(summary, null, 2),
  };
}
