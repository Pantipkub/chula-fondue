import assert from 'node:assert/strict';
import test from 'node:test';
import { configuration, profile, phaseAt, thresholds } from '../perf/lib/profile.js';
import { summarize } from '../perf/lib/summary.js';
import { reportHtml } from '../perf/lib/report.js';
import { parseStatsLine } from '../perf/lib/resources.js';

function fixture(type = 'stress') {
  const config = configuration({ TEST_TYPE: type });
  const phases = profile(config);
  const metrics = {};
  for (const p of phases.filter(p => p.measured)) {
    metrics[`read_requests{phase:${p.name}}`] = { values: { count: 10000 } };
    metrics[`read_latency{phase:${p.name}}`] = { values: { med: 50, 'p(95)': 100, 'p(99)': 150, max: 200 } };
    metrics[`read_errors{phase:${p.name}}`] = { values: { rate: 0 } };
    metrics[`read_invalid_content{phase:${p.name}}`] = { values: { rate: 0 } };
    metrics[`read_timeouts{phase:${p.name}}`] = { values: { count: 0 } };
  }
  return { config, phases, data: { metrics, setup_data: { reporters: [{ token: 'must-not-leak' }] } } };
}

test('average and stress use identical pacing/baseline, with a separate recovery plateau', () => {
  const average = configuration(); const stress = configuration({ TEST_TYPE: 'stress' });
  assert.equal(average.thinkSeconds, stress.thinkSeconds);
  assert.equal(average.baselineVus, stress.baselineVus);
  assert.deepEqual(profile(stress).filter(p => p.measured).map(p => [p.name, p.vus]), [
    ['baseline', 50], ['stress', 100], ['peak', 200], ['recovery', 50],
  ]);
  assert.equal(profile(average).find(p => p.name === 'baseline').seconds, 180);
  assert.equal(profile(stress).find(p => p.name === 'recovery').seconds, 120);
});

test('phase boundaries exclude setup, warm-up and ramps from baseline/recovery results', () => {
  const phases = profile(configuration());
  assert.equal(phaseAt(phases, 59.999), 'ramp_baseline');
  assert.equal(phaseAt(phases, 60), 'baseline');
  assert.equal(phaseAt(phases, 239.999), 'baseline');
  assert.equal(phaseAt(phases, 240), 'ramp_down');
  assert.equal(phaseAt(phases, 255), 'finished');
});

test('invalid load parameters fail before a workload is sent', () => {
  for (const env of [{ TEST_TYPE: 'unknown' }, { BASELINE_VUS: '0' }, { PEAK_VUS: '100' }, { THINK_MS: '-1' }, { HOLD_SECONDS: 'NaN' }]) {
    assert.throws(() => configuration(env));
  }
});

test('empty or absent measurements cannot produce a passing report', () => {
  const { config, phases } = fixture();
  assert.equal(summarize({ metrics: {} }, config, phases).passed, false);
});

test('plateau throughput excludes warmup time and exported results omit tokens', () => {
  const { config, phases, data } = fixture('average');
  const result = summarize(data, config, phases);
  assert.equal(result.passed, true);
  assert.equal(result.phases[0].requestsPerSecond, 10000 / 180);
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
});

test('stress degradation is observable, while failed recovery fails the run', () => {
  const { config, phases, data } = fixture();
  data.metrics['read_latency{phase:peak}'].values['p(95)'] = 1500;
  data.metrics['read_errors{phase:peak}'].values.rate = 0.05;
  let result = summarize(data, config, phases);
  assert.equal(result.overloadObserved, true);
  assert.equal(result.passed, true);
  data.metrics['read_errors{phase:recovery}'].values.rate = 0.01;
  result = summarize(data, config, phases);
  assert.equal(result.passed, false);
  assert.deepEqual(thresholds(config, phases)['read_errors{phase:peak}'], ['rate>=0']);
  assert.deepEqual(thresholds(config, phases)['read_errors{phase:recovery}'], ['rate<0.01']);
});

test('HTTP 200 with incorrect content invalidates even a heavy-load run', () => {
  const { config, phases, data } = fixture();
  data.metrics['read_invalid_content{phase:peak}'].values.rate = 0.001;
  assert.equal(summarize(data, config, phases).passed, false);
});

test('quick results are explicitly labelled as validation only', () => {
  const { data } = fixture(); const config = configuration({ PERF_QUICK: 'true' });
  assert.equal(summarize(data, config, profile(config)).validationOnly, true);
});

test('offline chart escapes labels and clearly identifies quick validation', () => {
  const { config, phases, data } = fixture('average');
  const summary = summarize(data, { ...config, quick: true }, phases);
  const html = reportHtml([{ name: '<script>unsafe</script>', summary }]);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>unsafe'));
  assert.ok(html.includes('QUICK VALIDATION ONLY'));
  assert.ok(html.includes('Requests per second by phase'));
  assert.ok(html.includes('role="tablist"'));
  assert.ok(html.includes('id="panel-average"'));
  assert.ok(html.includes('id="panel-stress"'));
});

test('average and stress have distinct panels and every repetition has its own view', () => {
  const makeRun = (type, number) => {
    const { config, phases, data } = fixture(type);
    return { name: `${number}-${type}`, exitCode: 0,
      resources: [{ name: 'fondue-test-ticket-service-1', cpuPercent: 150, memoryBytes: 10485760 }],
      summary: summarize(data, config, phases) };
  };
  const html = reportHtml([makeRun('average', 1), makeRun('stress', 1), makeRun('average', 2), makeRun('stress', 2)]);
  const average = html.slice(html.indexOf('id="panel-average"'), html.indexOf('id="panel-stress"'));
  const stress = html.slice(html.indexOf('id="panel-stress"'));
  assert.ok(!average.includes('Recovery vs baseline'));
  assert.ok(stress.includes('Recovery vs baseline'));
  assert.ok(average.includes('รอบที่ 2 · 2-average'));
  assert.ok(stress.includes('รอบที่ 2 · 2-stress'));
  assert.ok(average.includes('data-run="1" hidden'));
  assert.ok(stress.includes('data-run="1" hidden'));
  assert.ok(html.includes('Maximum sampled CPU percentage by container'));
  assert.ok(html.includes('Maximum sampled memory in MiB by container'));
});

test('missing metrics and resource samples stay visibly missing in the dashboard', () => {
  const { config, phases } = fixture('average');
  const html = reportHtml([{ name: 'failed-average', exitCode: 1, resources: [], summary: summarize({ metrics: {} }, config, phases) }]);
  assert.ok(html.includes('ตรวจสอบผลรอบนี้'));
  assert.ok(html.includes('ยังไม่มีข้อมูลสำหรับกราฟนี้'));
  assert.ok(html.includes('ไม่มีข้อมูล'));
  assert.ok(!html.includes('100.00%'));
});

test('Docker Desktop terminal repaint controls do not discard CPU/RAM evidence', () => {
  const sample = { Name: 'fondue-k6-test', CPUPerc: '150.2%', MemUsage: '25MiB / 8GiB' };
  assert.deepEqual(parseStatsLine('\u001b[H' + JSON.stringify(sample) + '\u001b[K\r'), sample);
  assert.equal(parseStatsLine('\u001b[J\u001b[K'), null);
  assert.throws(() => parseStatsLine('not JSON'));
});
