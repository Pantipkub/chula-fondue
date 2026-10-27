#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed, functionalSuite, discoverySuite, failureSuite, performanceSuite } from './suites.mjs';
import { audit } from './audit.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'z').toLowerCase()}-${randomUUID().slice(0, 4)}`;
const options = {
  mode: 'all', port: Number(process.env.VERIFICATION_PORT ?? 31320),
  project: `chula-fondue-person3-${runId}`, warmup: 10, duration: 60, concurrency: 20,
  keepUp: false,
};
const help = `Usage: node scripts/verification/run.mjs [options]
  --mode all|functional|discovery|failure|performance  (default all)
  --port N            free loopback Gateway port (default VERIFICATION_PORT or 31320)
  --project NAME      NEW name starting chula-fondue-person3- (default unique run ID)
  --warmup SECONDS    per endpoint (default 10)
  --duration SECONDS  per endpoint (default 60)
  --concurrency N     closed-loop workers (default 20)
  --keep-up           retain ready containers after tests; default down preserves volumes
  --help              print this usage

Requires Docker Compose v2 and host Node >=22.13. Builds current source; never reuses
an existing project/volume. Default performance dataset is exactly 100 tickets.
Nondefault load options are labelled exploratory, not the required baseline.
Exit: 0=all selected checks PASS; 1=FAIL; 2=invalid arguments.
Evidence: docs/evidence/<run-id>/{report.md,summary.json,*-samples.csv,...}.
`;
try {
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--help') { console.log(help); process.exit(0); }
    if (flag === '--keep-up') { options.keepUp = true; continue; }
    const key = { '--mode': 'mode', '--port': 'port', '--project': 'project', '--warmup': 'warmup', '--duration': 'duration', '--concurrency': 'concurrency' }[flag];
    assert.ok(key && process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `unknown flag or missing value: ${flag}`);
    options[key] = ['port', 'warmup', 'duration', 'concurrency'].includes(key) ? Number(process.argv[++i]) : process.argv[++i];
  }
  assert.ok(['all', 'functional', 'discovery', 'failure', 'performance'].includes(options.mode), 'invalid mode');
  assert.match(options.project, /^chula-fondue-person3-[a-z0-9][a-z0-9-]{0,40}$/, 'use a NEW project name beginning chula-fondue-person3-');
  for (const [key, min, max] of [['port', 1024, 65535], ['warmup', 1, 300], ['duration', 1, 3600], ['concurrency', 1, 100]]) {
    assert.ok(Number.isInteger(options[key]) && options[key] >= min && options[key] <= max, `invalid ${key}`);
  }
} catch (error) { console.error(`${error.message}\n${help}`); process.exit(2); }

const output = path.join(root, 'docs/evidence', runId);
mkdirSync(output, { recursive: true });
const checks = [];
const startedAt = new Date().toISOString();
const baseline = options.warmup === 10 && options.duration === 60 && options.concurrency === 20;
let started = false;
let interrupted = false;
let activeCommand;
// An interrupt ends the current command/load, then goes through restoration in finally.
const aborter = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  aborter.abort(new Error(signal));
  activeCommand?.kill('SIGTERM');
  console.error(`[interrupt] ${signal}; restoring this run's services before shutdown`);
});

function save(file, value) { writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n'); }
function event(value) { appendFileSync(path.join(output, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n'); }
async function command(binary, args, { timeout = 300000 } = {}) {
  const id = randomUUID().slice(0, 8);
  const began = performance.now();
  event({ event: 'command_start', id, binary, args });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: root, env: { ...process.env, GATEWAY_PORT: String(options.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeCommand = child;
    let stdout = '', stderr = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill('SIGTERM'); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; appendFileSync(path.join(output, 'commands.log'), chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; appendFileSync(path.join(output, 'commands.log'), chunk); });
    child.on('error', error => { clearTimeout(timer); activeCommand = undefined; reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer); activeCommand = undefined;
      resolve({ code, signal, expired, stdout, stderr });
    });
  });
  event({ event: 'command_end', id, code: result.code, signal: result.signal, expired: result.expired, durationMs: performance.now() - began });
  if (result.code !== 0 || result.expired) throw new Error(`${binary} ${args.slice(0, 5).join(' ')} failed (exit ${result.code}${result.expired ? ', timeout' : ''}): ${result.stderr.slice(-1200)}`);
  return result.stdout;
}
const docker = args => command('docker', args);
const compose = args => docker(['compose', '-p', options.project, ...args]);
async function http(route, method = 'GET', body, expected = 200, requestId = `p3-${randomUUID()}`) {
  if (interrupted) throw new Error('run interrupted');
  const began = performance.now();
  const response = await fetch(`http://127.0.0.1:${options.port}${route}`, {
    method, signal: AbortSignal.any([AbortSignal.timeout(6500), aborter.signal]),
    headers: { 'x-request-id': requestId, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  const durationMs = performance.now() - began;
  event({ event: 'http', method, route, expected, status: response.status, durationMs, requestId });
  if (expected !== null) assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data).slice(0, 250)}`);
  assert.equal(response.headers.get('x-request-id'), requestId, 'HTTP request ID echoed');
  return { status: response.status, data, durationMs };
}
async function waitReady() {
  const end = Date.now() + 45000;
  let last;
  do {
    try {
      const response = await http('/ready');
      assert.equal(response.data.status, 'ready');
      assert.equal(response.data.dependencies.department.status, 'up');
      assert.equal(response.data.dependencies.ticket.status, 'up');
      return response;
    } catch (error) { last = error; }
    if (interrupted) throw new Error('run interrupted');
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < end);
  throw last;
}
const ctx = { root, options, runId, output, base: `http://127.0.0.1:${options.port}`, save, event, docker, compose, http, waitReady, signal: aborter.signal };
async function check(name, fn) {
  if (interrupted) throw new Error('run interrupted');
  console.log(`[check] ${name}`);
  const began = performance.now();
  let result;
  try { result = { name, status: 'PASS', detail: await fn() }; }
  catch (error) { result = { name, status: 'FAIL', error: error.message }; }
  Object.assign(result, { durationMs: performance.now() - began, finishedAt: new Date().toISOString() });
  checks.push(result); save('checks.json', checks); event({ event: 'check', ...result });
  console.log(`[${result.status}] ${name}${result.error ? `: ${result.error}` : ''}`);
  return result.status === 'PASS';
}
function selected(mode) { return options.mode === 'all' || options.mode === mode; }

try {
  const setup = await check('setup', async () => {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', () => server.close(resolve));
    });
    await docker(['version', '--format', '{{.Server.Version}}']);
    assert.equal((await compose(['ps', '-a', '-q'])).trim(), '', 'refuse existing containers; choose a new project');
    assert.equal((await docker(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${options.project}`])).trim(), '', 'refuse existing volumes; choose a new project');
    await compose(['config', '--quiet']);
    console.log('[setup] building current source and starting isolated services');
    started = true;
    await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '120']);
    await waitReady();
    const files = (await command('git', ['ls-files', '--cached', '--others', '--exclude-standard'])).trim().split('\n')
      .filter(file => /^(services\/.*\.(ts|json)|proto\/.*|docker\/.*\.mjs|scripts\/.*\.mjs|Dockerfile|compose\.yaml|package(-lock)?\.json|tsconfig\.base\.json)$/.test(file)).sort();
    const hashes = Object.fromEntries(files.filter(file => existsSync(path.join(root, file))).map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
    const environment = {
      recordedAt: new Date().toISOString(), gitCommit: (await command('git', ['rev-parse', 'HEAD'])).trim(),
      gitDirty: Boolean((await command('git', ['status', '--porcelain'])).trim()), sourceSha256: hashes,
      host: { platform: os.platform(), release: os.release(), architecture: os.arch(), node: process.version, cpuModel: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), freeMemoryBytesAtSetup: os.freemem() },
      docker: JSON.parse(await docker(['info', '--format', '{"serverVersion":"{{.ServerVersion}}","cpus":{{.NCPU}},"memoryBytes":{{.MemTotal}},"architecture":"{{.Architecture}}","os":"{{.OperatingSystem}}","kernel":"{{.KernelVersion}}"}'])),
      composeVersion: (await docker(['compose', 'version', '--short'])).trim(),
      containerNode: (await compose(['exec', '-T', 'api-gateway', 'node', '--version'])).trim(),
      images: await compose(['images', '--format', 'json']),
      concurrentComposeProjects: [...new Set((await docker(['ps', '--format', '{{.Label "com.docker.compose.project"}}'])).trim().split('\n').filter(Boolean))],
    };
    save('environment.json', environment);
    return { project: options.project, port: options.port, environment: 'environment.json' };
  });
  if (!setup) throw new Error('setup failed; dependent checks NOT_RUN');
  const seeded = await check('fixtures', () => seed(ctx));
  if (!seeded) throw new Error('fixture setup failed; dependent checks NOT_RUN');
  // Measure before functional mutations so both endpoints use exactly 100 tickets.
  if (selected('performance')) await check('performance', () => performanceSuite(ctx));
  if (ctx.performance) await check('raw-evidence-audit', () => audit(output));
  if (selected('functional')) await check('functional', () => functionalSuite(ctx));
  if (ctx.trace) await check('request-correlation', async () => {
    const lines = (await compose(['logs', '--no-color', '--tail', '1000'])).split('\n').filter(line => line.includes(ctx.trace));
    // Nest emits its own ANSI suffix even with Compose --no-color. Isolate the JSON.
    const records = lines.flatMap(line => { try { return [JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1))]; } catch { return []; } });
    const services = [...new Set(records.map(record => record.service))];
    for (const service of ['api-gateway', 'ticket-service', 'department-service']) assert.ok(services.includes(service), `trace reaches ${service}`);
    save('request-correlation.json', { requestId: ctx.trace, services, records });
    return { requestId: ctx.trace, services, records: records.length };
  });
  // Capture correlation before recreation removes the original service containers/logs.
  if (selected('discovery')) await check('discovery-and-persistence', () => discoverySuite(ctx));
  if (selected('failure')) await check('dependency-failures', () => failureSuite(ctx));
} catch (error) {
  console.error(`[run] ${error.message}`);
  event({ event: 'run_error', error: error.message });
  if (!checks.some(c => c.status === 'FAIL')) checks.push({ name: 'run', status: 'FAIL', error: error.message });
} finally {
  if (started) {
    await checkRestoration();
  }
  for (const [mode, name] of [['performance', 'performance'], ['functional', 'functional'], ['discovery', 'discovery-and-persistence'], ['failure', 'dependency-failures']]) {
    if (!checks.some(check => check.name === name)) checks.push({ name, status: 'NOT_RUN', reason: selected(mode) ? 'setup/dependency/interruption prevented execution' : `not selected by --mode ${options.mode}` });
  }
  const summary = {
    runId, startedAt, finishedAt: new Date().toISOString(),
    command: `node scripts/verification/run.mjs${process.argv.slice(2).map(arg => ` ${arg}`).join('')}`,
    project: options.project, baseUrl: ctx.base, options, requiredLoadProfile: baseline,
    interrupted, status: checks.some(c => c.status === 'FAIL') ? 'FAIL' : 'PASS',
    checks, performance: ctx.performance ?? [],
    evidenceDirectory: path.relative(root, output),
    limitations: ['Single local Docker host, SQLite, no authentication or external integrations.', '20 closed-loop workers are not 1,000 active users.', 'No sustained uptime, HA, multi-host discovery, backup/restore or write-load claim.', 'Other Compose projects remain running; CPU, memory and load-generator resources are shared.'],
  };
  save('checks.json', checks); save('summary.json', summary);
  const rows = summary.performance.map(r => `| ${r.name} | ${r.status} | ${r.requests} | ${r.throughputPerSecond.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.p99Ms.toFixed(2)} | ${r.errorRatePercent.toFixed(3)}% |`).join('\n');
  writeFileSync(path.join(output, 'report.md'), `# Verification ${runId}\n\nStatus: **${summary.status}**. UTC: ${startedAt} to ${summary.finishedAt}.\n\nCommand: \`${summary.command}\`\n\nProject: \`${options.project}\`, Gateway: ${ctx.base}. Fresh isolated volumes; data retained after shutdown.\n\nRequired load profile: **${baseline ? 'YES' : 'NO — exploratory'}**. See [environment](environment.json), [fixtures](fixtures.json), [events](events.jsonl), [commands](commands.log) and [summary](summary.json).\n\n| Check | Status | Detail |\n| --- | --- | --- |\n${checks.map(c => `| ${c.name} | ${c.status} | ${(c.error ?? c.reason ?? `${Math.round(c.durationMs)} ms`).replaceAll('|', '/').replaceAll('\n', ' ')} |`).join('\n')}\n\n| Endpoint | Result | Requests | req/s | p50 ms | p95 ms | p99 ms | Error |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\nLoad uses ${options.concurrency} closed-loop workers per endpoint, ${options.warmup}s warm-up and ${options.duration}s measurement, serial endpoint runs and 100 tickets. Warm-up is excluded. Requests start within the measurement window; in-flight requests drain and remain in the sample/throughput denominator. Latency includes full HTTP body, JSON parsing and payload verification; nearest-rank percentiles use all attempts, including errors. Raw CSV and endpoint summaries permit recalculation. Targets: p95 <1,000 ms AND errors <1%.\n\n${summary.limitations.map(item => `- ${item}`).join('\n')}\n\nNOT_RUN: 1,000-user capacity, 99.5% uptime observation, cloud/HA, concurrent mutation load, security assessment and a real network-delay/packet-loss experiment. Frozen-container faults exercise a nonresponsive peer.\n`);
  console.log(`[${summary.status}] Evidence: ${path.relative(root, output)}/report.md`);
  if (summary.status === 'FAIL') process.exitCode = 1;
}

async function checkRestoration() {
  // Cleanup must run even after an interrupt, without the aborted test signal.
  const began = performance.now();
  try {
    const ids = (await compose(['ps', '-a', '-q'])).trim().split('\n').filter(Boolean);
    for (const id of ids) {
      const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', id]));
      if (state.Paused) await docker(['unpause', id]);
      if (!state.Running) await docker(['start', id]);
    }
    // Starting individual owned containers avoids stale Compose unhealthy dependency
    // status preventing restoration. Application readiness is checked independently.
    // Use a fresh non-aborted fetch for final readiness.
    const end = Date.now() + 45000;
    let ready = false;
    do {
      try {
        const response = await fetch(ctx.base + '/ready', { signal: AbortSignal.timeout(2000) });
        const body = await response.json();
        ready = response.status === 200 && body.status === 'ready' && body.dependencies.department.status === 'up' && body.dependencies.ticket.status === 'up';
      } catch { /* bounded retry while services reconnect */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 500));
    } while (!ready && Date.now() < end);
    assert.ok(ready, 'final readiness recovered');
    const finalState = await compose(['ps', '--format', 'json']);
    writeFileSync(path.join(output, 'final-containers.jsonl'), finalState);
    checks.push({ name: 'restoration', status: 'PASS', durationMs: performance.now() - began, detail: { readiness: 200, allUnpaused: true } });
  } catch (error) {
    checks.push({ name: 'restoration', status: 'FAIL', error: error.message, durationMs: performance.now() - began });
  } finally {
    if (!options.keepUp) {
      const shutdownBegan = performance.now();
      try {
        await compose(['down', '--timeout', '10']);
        checks.push({ name: 'shutdown', status: 'PASS', durationMs: performance.now() - shutdownBegan, detail: 'containers/network removed; named volumes retained' });
      } catch (error) { checks.push({ name: 'shutdown', status: 'FAIL', durationMs: performance.now() - shutdownBegan, error: error.message }); }
    }
  }
}
