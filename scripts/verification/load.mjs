import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

// Closed-loop workers: each worker waits for a complete response before sending again.
// Raw rows retain every measured request, including errors and the final drain.
export async function measure(ctx, name, paths, validate) {
  const { concurrency, warmup, duration } = ctx.options;
  let sequence = 0;
  const request = async (record, rows, start, worker) => {
    const index = sequence++;
    const path = paths[index % paths.length];
    const began = performance.now();
    let status = 0, bytes = 0, error = '';
    try {
      const response = await fetch(ctx.base + path, {
        signal: AbortSignal.any([AbortSignal.timeout(6000), ctx.signal]),
        headers: { 'x-request-id': `p3-load-${name}-${index}` },
      });
      status = response.status;
      const body = await response.text();
      bytes = Buffer.byteLength(body);
      if (status !== 200) error = `HTTP_${status}`;
      else {
        try { validate(JSON.parse(body), path); }
        catch { error = 'INVALID_PAYLOAD'; }
      }
    } catch (cause) {
      error = cause.name === 'TimeoutError' ? 'CLIENT_TIMEOUT' : 'TRANSPORT_ERROR';
    }
    const completed = performance.now();
    if (record) rows.push({
      worker, path, startMs: began - start, endMs: completed - start,
      latencyMs: completed - began, status, bytes, error,
    });
  };
  async function phase(seconds, record) {
    const rows = [];
    const start = performance.now();
    const end = start + seconds * 1000;
    const timer = setInterval(() => console.log(`[load] ${name} ${record ? 'measure' : 'warm-up'} ${Math.round((performance.now() - start) / 1000)}s`), 10000);
    try {
      await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
        while (performance.now() < end) {
          ctx.signal.throwIfAborted();
          await request(record, rows, start, worker);
        }
      }));
      return { rows, elapsedMs: performance.now() - start };
    } finally { clearInterval(timer); }
  }
  console.log(`[load] ${name}: warm-up ${warmup}s, then ${duration}s with ${concurrency} workers`);
  await phase(warmup, false);
  const startedAt = new Date().toISOString();
  const { rows, elapsedMs } = await phase(duration, true);
  const latencies = rows.map(row => row.latencyMs).sort((a, b) => a - b);
  assert.ok(rows.length > 0, 'load generator completed requests');
  const percentile = p => latencies[Math.max(0, Math.ceil(p * latencies.length) - 1)];
  const errors = rows.filter(row => row.error);
  const statusCounts = {}, errorCounts = {};
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (row.error) errorCounts[row.error] = (errorCounts[row.error] ?? 0) + 1;
  }
  const summary = {
    name, startedAt, finishedAt: new Date().toISOString(),
    model: 'closed-loop; one in-flight request per worker; no think time',
    concurrency, warmupSeconds: warmup, scheduledSeconds: duration,
    elapsedIncludingDrainSeconds: elapsedMs / 1000,
    requests: rows.length, errors: errors.length, errorRatePercent: errors.length / rows.length * 100,
    throughputPerSecond: rows.length / (elapsedMs / 1000),
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
    maxMs: latencies.at(-1), statusCounts, errorCounts,
    responseBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    target: { p95MsLessThan: 1000, errorRatePercentLessThan: 1 },
    raw: `${name}-samples.csv`,
  };
  summary.status = summary.p95Ms < 1000 && summary.errorRatePercent < 1 ? 'PASS' : 'FAIL';
  writeFileSync(`${ctx.output}/${name}-samples.csv`,
    'worker,path,start_ms,end_ms,latency_ms,http_status,response_bytes,error\n' +
    rows.map(r => [r.worker, r.path, r.startMs.toFixed(3), r.endMs.toFixed(3), r.latencyMs.toFixed(3), r.status, r.bytes, r.error].join(',')).join('\n') + '\n');
  ctx.save(`${name}-summary.json`, summary);
  return summary;
}
