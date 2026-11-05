import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const url = process.env.API_URL ?? 'http://127.0.0.1:3100';
const auth = await fetch(url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@fondue.test', password: process.env.ADMIN_PASSWORD ?? 'FondueDemo!2026' }) }).then(r => r.json());
assert.ok(auth.accessToken, 'demo administrator login succeeds');
const headers = { Authorization: `Bearer ${auth.accessToken}` };
const { tickets } = await fetch(url + '/tickets', { headers }).then(r => r.json());
assert.ok(tickets?.length, 'run API tests to create fixtures first');
const users = 50, seconds = Number(process.env.PERF_SECONDS ?? 60), end = Date.now() + seconds * 1000;
const durations = []; let failures = 0;
await Promise.all(Array.from({ length: users }, async () => {
  while (Date.now() < end) {
    const start = performance.now();
    try { const r = await fetch(`${url}/tickets/${tickets[0].id}/history`, { headers, signal: AbortSignal.timeout(5000) }); await r.text(); if (!r.ok) failures++; }
    catch { failures++; }
    durations.push(performance.now() - start);
    await new Promise(r => setTimeout(r, 100));
  }
}));
durations.sort((a, b) => a - b);
const result = { users, seconds, requests: durations.length, failures, p95ms: durations[Math.floor(durations.length * 0.95)], maxms: durations.at(-1), testedAt: new Date().toISOString(), scope: 'Single-host ticket-history read workload; not a whole-system capacity or uptime guarantee' };
writeFileSync('test-results/performance.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
assert.equal(failures, 0); assert.ok(result.p95ms < 2000, 'p95 must stay below 2 seconds');
