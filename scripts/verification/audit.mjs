import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Recompute the published numbers from raw evidence, independently of the load loop.
export function audit(directory) {
  const read = file => JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
  const fixtures = read('fixtures.json');
  assert.equal(fixtures.tickets.length, 100);
  const ids = new Set(fixtures.tickets.map(t => t.id));
  assert.equal(ids.size, 100);
  const endpoints = [];
  for (const name of ['tickets-list', 'ticket-history']) {
    const summary = read(`${name}-summary.json`);
    const lines = readFileSync(path.join(directory, summary.raw), 'utf8').trimEnd().split('\n');
    assert.equal(lines.shift(), 'worker,path,start_ms,end_ms,latency_ms,http_status,response_bytes,error');
    const samples = lines.map(line => {
      const [worker, route, start, end, latency, status, bytes, error] = line.split(',');
      return { worker: Number(worker), route, start: Number(start), end: Number(end), latency: Number(latency), status: Number(status), bytes: Number(bytes), error };
    });
    assert.equal(samples.length, summary.requests);
    assert.equal(new Set(samples.map(r => r.worker)).size, summary.concurrency);
    const errors = samples.filter(r => r.error).length;
    const statusCounts = {}, errorCounts = {};
    const routes = new Set();
    for (const row of samples) {
      assert.ok(row.start >= 0 && row.start < summary.scheduledSeconds * 1000);
      assert.ok(row.end >= row.start && Math.abs(row.end - row.start - row.latency) < .003);
      assert.ok(row.worker >= 0 && row.worker < summary.concurrency);
      assert.ok(row.error || row.status === 200);
      if (name === 'tickets-list') assert.equal(row.route, '/tickets');
      else assert.ok(ids.has(row.route.split('/')[2]) && row.route.endsWith('/history'));
      routes.add(row.route);
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      if (row.error) errorCounts[row.error] = (errorCounts[row.error] ?? 0) + 1;
    }
    if (name === 'ticket-history') assert.equal(routes.size, 100, 'all 100 history IDs exercised');
    const sorted = samples.map(r => r.latency).sort((a, b) => a - b);
    const quantile = p => sorted[Math.ceil(p * sorted.length) - 1];
    for (const [key, p] of [['p50Ms', .5], ['p95Ms', .95], ['p99Ms', .99]]) assert.ok(Math.abs(summary[key] - quantile(p)) < .001, key);
    assert.equal(errors, summary.errors);
    assert.equal(errors / samples.length * 100, summary.errorRatePercent);
    assert.equal(samples.reduce((n, row) => n + row.bytes, 0), summary.responseBytes);
    assert.deepEqual(statusCounts, summary.statusCounts);
    assert.deepEqual(errorCounts, summary.errorCounts);
    const lastEndMs = samples.reduce((max, row) => Math.max(max, row.end), 0);
    assert.ok(Math.abs(lastEndMs - summary.elapsedIncludingDrainSeconds * 1000) < 100, 'drain elapsed agrees with last completion');
    assert.equal(samples.length / summary.elapsedIncludingDrainSeconds, summary.throughputPerSecond);
    assert.equal(summary.status, summary.p95Ms < 1000 && summary.errorRatePercent < 1 ? 'PASS' : 'FAIL');
    endpoints.push({ name, requests: samples.length, errors, workers: summary.concurrency, uniquePaths: routes.size, p50Ms: quantile(.5), p95Ms: quantile(.95), p99Ms: quantile(.99), throughputPerSecond: samples.length / summary.elapsedIncludingDrainSeconds });
  }
  const result = { status: 'PASS', auditedAt: new Date().toISOString(), method: 'Recomputed from raw CSV; percentile tolerance 0.001ms for CSV rounding', endpoints };
  writeFileSync(path.join(directory, 'audit.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv[2], 'Usage: node scripts/verification/audit.mjs docs/evidence/<run-id>');
    console.log(JSON.stringify(audit(path.resolve(process.argv[2])), null, 2));
  } catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
}
