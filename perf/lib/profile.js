// Pure configuration shared by k6, the runner, and Node's unit tests.
export function configuration(env = {}) {
  const integer = (name, fallback, min = 1, max = 1000) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return value;
  };
  const type = env.TEST_TYPE || 'average';
  if (!['average', 'stress'].includes(type)) throw new Error('TEST_TYPE must be average or stress');
  const quick = env.PERF_QUICK === 'true';
  const baselineVus = integer('BASELINE_VUS', 50);
  const stressVus = integer('STRESS_VUS', 100);
  const peakVus = integer('PEAK_VUS', 200);
  if (stressVus <= baselineVus || peakVus <= stressVus) throw new Error('Require BASELINE_VUS < STRESS_VUS < PEAK_VUS');
  return {
    type, quick, baselineVus, stressVus, peakVus,
    warmupSeconds: quick ? 2 : 30,
    rampSeconds: quick ? 2 : 30,
    holdSeconds: quick ? 5 : integer('HOLD_SECONDS', type === 'average' ? 180 : 120, 10, 3600),
    rampDownSeconds: quick ? 2 : 15,
    thinkSeconds: integer('THINK_MS', 100, 0, 60000) / 1000,
    reporters: integer('PERF_REPORTERS', 5, 1, 10),
    ticketsPerReporter: integer('TICKETS_PER_REPORTER', 5, 1, 100),
    p95LimitMs: integer('P95_LIMIT_MS', 1000, 1, 60000),
    errorLimit: 0.01,
  };
}

export function profile(config) {
  const phases = [];
  let elapsed = 0;
  function add(name, seconds, vus, measured = false, required = false) {
    phases.push({ name, seconds, vus, start: elapsed, end: elapsed + seconds, measured, required });
    elapsed += seconds;
  }
  add('warmup', config.warmupSeconds, Math.min(10, config.baselineVus));
  add('ramp_baseline', config.rampSeconds, config.baselineVus);
  add('baseline', config.holdSeconds, config.baselineVus, true, true);
  if (config.type === 'stress') {
    add('ramp_stress', config.rampSeconds, config.stressVus);
    add('stress', config.holdSeconds, config.stressVus, true);
    add('ramp_peak', config.rampSeconds, config.peakVus);
    add('peak', config.holdSeconds, config.peakVus, true);
    add('ramp_recovery', config.rampSeconds, config.baselineVus);
    add('recovery', config.holdSeconds, config.baselineVus, true, true);
  }
  add('ramp_down', config.rampDownSeconds, 0);
  return phases;
}

export function phaseAt(phases, seconds) {
  return phases.find(phase => seconds >= phase.start && seconds < phase.end)?.name ?? 'finished';
}

export function thresholds(config, phases) {
  const result = {};
  for (const phase of phases.filter(p => p.measured)) {
    const filter = `{phase:${phase.name}}`;
    // Referencing each submetric makes k6 include phase-specific values in handleSummary.
    // Heavy-load SLO breaches are observations; baseline/recovery still gate the run.
    result[`read_latency${filter}`] = [phase.required ? `p(95)<${config.p95LimitMs}` : 'p(95)>=0'];
    result[`read_errors${filter}`] = [phase.required ? 'rate<0.01' : 'rate>=0'];
    result[`read_invalid_content${filter}`] = ['rate==0'];
    result[`read_requests${filter}`] = [`count>=${phase.vus}`];
    result[`read_timeouts${filter}`] = ['count>=0'];
  }
  return result;
}
