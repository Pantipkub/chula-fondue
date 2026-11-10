export function summarize(data, config, phases) {
  const metric = (name, phase) => data.metrics?.[`${name}{phase:${phase}}`]?.values ?? {};
  const measured = phases.filter(p => p.measured).map(phase => {
    const count = metric('read_requests', phase.name).count ?? 0;
    const latency = metric('read_latency', phase.name);
    const errors = metric('read_errors', phase.name).rate ?? null;
    const invalid = metric('read_invalid_content', phase.name).rate ?? null;
    const enoughSamples = count >= phase.vus;
    const validContent = invalid === 0;
    const sloPassed = enoughSamples && validContent && Number.isFinite(latency['p(95)']) && latency['p(95)'] < config.p95LimitMs && errors !== null && errors < config.errorLimit;
    return {
      ...phase, requests: count, requestsPerSecond: count / phase.seconds,
      latencyMs: { p50: latency.med ?? null, p95: latency['p(95)'] ?? null, p99: latency['p(99)'] ?? null, max: latency.max ?? null },
      errorRate: errors, invalidContentRate: invalid,
      timeouts: metric('read_timeouts', phase.name).count ?? 0,
      enoughSamples, validContent, sloPassed,
    };
  });
  const requiredPassed = measured.filter(p => p.required).every(p => p.sloPassed);
  const workloadValid = measured.every(p => p.enoughSamples && p.validContent);
  return {
    schemaVersion: 1, type: config.type, validationOnly: config.quick,
    generatedAt: new Date().toISOString(), measurementStartedAt: data.setup_data?.readyAt ?? null,
    scope: 'Local gateway -> JWT/ownership -> gRPC -> PostgreSQL ticket-history reads; excludes browser, uploads, and write/event throughput.',
    config, phases: measured, requiredPassed, workloadValid,
    passed: requiredPassed && workloadValid,
    overloadObserved: measured.some(p => !p.required && !p.sloPassed),
    interpretation: config.type === 'stress'
      ? 'Stress/peak SLO breaches are reported, not used to stop recovery. If all levels pass, the capacity limit was not found.'
      : `${config.baselineVus} VUs is a proposed baseline, not a measurement of real production traffic.`,
  };
}

export function summaryText(summary) {
  const format = value => value === null ? 'n/a' : value.toFixed(2);
  const rows = summary.phases.map(p => `${p.name.padEnd(10)} VUs=${p.vus} requests=${p.requests} req/s=${format(p.requestsPerSecond)} p95=${format(p.latencyMs.p95)}ms errors=${p.errorRate === null ? 'n/a' : format(p.errorRate * 100) + '%'} SLO=${p.sloPassed ? 'PASS' : 'FAIL'}`);
  return [`\n${summary.type.toUpperCase()} ${summary.validationOnly ? '(QUICK VALIDATION ONLY)' : ''}`, ...rows,
    `Required baseline/recovery: ${summary.passed ? 'PASS' : 'FAIL'}`, summary.interpretation, ''].join('\n');
}
