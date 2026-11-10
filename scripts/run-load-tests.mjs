import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuration, profile } from '../perf/lib/profile.js';
import { reportHtml } from '../perf/lib/report.js';
import { parseStatsLine } from '../perf/lib/resources.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/run-load-tests.mjs [average|stress|all] [--quick] [--repeat 1..10]\nUses the existing local fondue-demo Compose stack and grafana/k6:1.8.2.\nResults: test-results/load/<timestamp>/. See docs/load-testing.md.');
  process.exit(0);
}
const type = args[0] && !args[0].startsWith('--') ? args.shift() : 'all';
let repeats = 1, quick = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--quick') quick = true;
  else if (args[i] === '--repeat') repeats = Number(args[++i]);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!['average', 'stress', 'all'].includes(type) || !Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('Use average|stress|all and --repeat 1..10');
const envFile = resolve(root, process.env.PERF_ENV_FILE || '.env.demo');
if (!existsSync(envFile)) throw new Error(`Missing ${envFile}. Run npm run setup:demo first.`);
loadEnvFile(envFile);
const project = process.env.PERF_PROJECT || 'fondue-demo';
const image = process.env.K6_IMAGE || 'grafana/k6:1.8.2';
const types = type === 'all' ? ['average', 'stress'] : [type];
const overrides = Object.fromEntries(['BASELINE_VUS', 'STRESS_VUS', 'PEAK_VUS', 'HOLD_SECONDS', 'THINK_MS', 'PERF_REPORTERS', 'TICKETS_PER_REPORTER', 'P95_LIMIT_MS']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const configs = Object.fromEntries(types.map(testType => [testType, configuration({ ...overrides, TEST_TYPE: testType, PERF_QUICK: String(quick) })]));
const sync = (command, arguments_) => {
  const result = spawnSync(command, arguments_, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command} ${arguments_.slice(0, 3).join(' ')} failed: ${result.error?.message || result.stderr?.trim()}`);
  return result.stdout.trim();
};
const docker = arguments_ => sync('docker', arguments_);
const compose = ['compose', '--env-file', envFile, '-p', project];
const gateway = docker([...compose, 'ps', '-q', 'api-gateway']);
if (!gateway) throw new Error(`Start the ${project} Compose stack first; no running gateway found.`);
const networks = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', gateway]));
const network = Object.keys(networks).find(name => name === `${project}_backend`) || Object.keys(networks)[0];
if (!network) throw new Error('The gateway has no Docker network.');
docker(['exec', gateway, 'node', '-e', "fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]);
docker(['image', 'inspect', image, '--format', '{{.Id}}']);
const services = docker([...compose, 'ps', '-q']).split(/\r?\n/).filter(Boolean);
const postgres = docker([...compose, 'ps', '-q', 'postgres']);
const ticketCount = () => Number(docker(['exec', postgres, 'psql', '-U', 'fondue', '-d', 'ticket', '-tAc', 'SELECT count(*) FROM ticket']));
const containers = services.map(id => ({
  id, name: docker(['inspect', '--format', '{{.Name}}', id]).replace(/^\//, ''),
  imageId: docker(['inspect', '--format', '{{.Image}}', id]),
}));
const sourceFiles = ['perf/ticket-history.k6.js', 'perf/lib/profile.js', 'perf/lib/summary.js', 'perf/lib/report.js', 'perf/lib/resources.js', 'scripts/run-load-tests.mjs'];
const metadata = {
  generatedAt: new Date().toISOString(), commit: sync('git', ['rev-parse', 'HEAD']),
  branch: sync('git', ['branch', '--show-current']), dirty: !!sync('git', ['status', '--porcelain']),
  sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])),
  host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), node: process.version },
  docker: { version: docker(['version', '--format', '{{.Server.Version}}']), limits: docker(['info', '--format', 'CPUs={{.NCPU}} MemoryBytes={{.MemTotal}}']) },
  project, network, k6Image: image, k6ImageId: docker(['image', 'inspect', image, '--format', '{{.Id}}']), containers, configs,
  ticketsBeforeInvocation: ticketCount(),
};
const output = resolve(root, 'test-results', 'load', new Date().toISOString().replace(/[:.]/g, '-') + (quick ? '-quick' : ''));
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'environment.json'), JSON.stringify(metadata, null, 2));
console.log(`Evidence: ${output}\nProject: ${project}; network: ${network}${quick ? '\nQUICK VALIDATION ONLY - not performance evidence' : ''}`);
const runs = [];
let interrupted = false, activeContainer;
const interrupt = () => { interrupted = true; if (activeContainer) spawnSync('docker', ['stop', '-t', '2', activeContainer], { windowsHide: true }); };
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

function attach(container, logFile) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('docker', ['start', '--attach', container], { cwd: root, windowsHide: true });
    const log = chunk => { appendFileSync(logFile, chunk); process.stdout.write(chunk); };
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.on('error', reject); child.on('close', resolveRun);
  });
}

function monitor(ids, path) {
  const resources = new Map();
  const child = spawn('docker', ['stats', '--format', '{{json .}}', ...ids], { windowsHide: true });
  let buffer = '', monitorError = '', stopping = false;
  const exited = new Promise(resolveExit => {
    child.on('close', code => { if (!stopping) monitorError ||= `docker stats exited early (${code})`; resolveExit(); });
    child.on('error', error => { monitorError = error.message; resolveExit(); });
  });
  child.stderr.on('data', chunk => { monitorError ||= String(chunk).slice(0, 500); });
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const sample = parseStatsLine(line);
        if (!sample) continue;
        appendFileSync(path, JSON.stringify({ sampledAt: new Date().toISOString(), ...sample }) + '\n');
        const cpu = Number.parseFloat(sample.CPUPerc), memory = sample.MemUsage?.split(' / ')[0] || 'n/a';
        const previous = resources.get(sample.Name);
        const bytes = memoryBytes(memory);
        resources.set(sample.Name, { name: sample.Name, cpuPercent: Math.max(previous?.cpuPercent || 0, cpu || 0),
          memory: bytes > (previous?.memoryBytes || 0) ? memory : previous?.memory || memory, memoryBytes: Math.max(bytes, previous?.memoryBytes || 0) });
      } catch (error) { monitorError ||= error.message; }
    }
  });
  return { stop: async () => { stopping = true; child.kill(); await exited; return { resources: [...resources.values()], monitorError: monitorError.trim() || (!resources.size ? 'No resource samples were recorded.' : null) }; } };
}
function memoryBytes(value) {
  const match = /([\d.]+)\s*([KMGT]?i?B)/i.exec(value);
  if (!match) return 0;
  const unit = match[2].toLowerCase(), exponent = 'kmgt'.indexOf(unit[0]) + 1;
  return Number(match[1]) * (unit.includes('i') ? 1024 : 1000) ** Math.max(0, exponent);
}

try {
  for (let repeat = 1; repeat <= repeats && !interrupted; repeat++) {
    for (const testType of types) {
      if (interrupted) break;
      const name = `${repeat}-${testType}`;
      const directory = resolve(output, name); mkdirSync(directory);
      const config = configs[testType];
      const ticketsBefore = ticketCount();
      console.log(`\n${name}: ${profile(config).at(-1).end}s scheduled, excluding fixture setup.`);
      const containerName = `fondue-k6-${Date.now()}-${name}`;
      const env = { ...overrides, TEST_TYPE: testType, PERF_QUICK: String(quick), BASE_URL: 'http://api-gateway:3000', RESULT_DIR: '/results' };
      // The checkout is read-only; only this run's result directory is writable by k6.
      activeContainer = docker(['create', '--name', containerName, '--network', network,
        '--mount', `type=bind,source=${root},target=/work,readonly`,
        '--mount', `type=bind,source=${directory},target=/results`, '-w', '/work',
        ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        image, 'run', '--quiet', 'perf/ticket-history.k6.js']);
      const stats = monitor([...services, activeContainer], resolve(directory, 'resources.ndjson'));
      const run = { name, ticketsBefore, summary: null, exitCode: null, resources: [], monitorError: null };
      try {
        await attach(activeContainer, resolve(directory, 'console.log'));
        run.exitCode = Number(docker(['inspect', '--format', '{{.State.ExitCode}}', activeContainer]));
        const summaryFile = resolve(directory, 'summary.json');
        if (existsSync(summaryFile)) run.summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
      } finally {
        Object.assign(run, await stats.stop());
        docker(['rm', '--force', activeContainer]); activeContainer = undefined;
        runs.push(run);
        writeFileSync(resolve(output, 'runs.json'), JSON.stringify(runs, null, 2));
        writeFileSync(resolve(output, 'report.html'), reportHtml(runs, metadata));
      }
      if (run.exitCode !== 0 || !run.summary?.passed) { console.error(`${name} failed; see console.log and report.html.`); process.exitCode = 1; }
      if (run.monitorError) { console.error(`Resource monitoring incomplete: ${run.monitorError}`); process.exitCode = 1; }
      // Let fixtures from repeated short runs stay below the existing login/register rate limit.
      if (quick && (repeat < repeats || testType !== types.at(-1)) && !interrupted) {
        console.log('Waiting 65s for the authentication rate-limit window before the next quick run.');
        for (let second = 0; second < 65 && !interrupted; second++) await new Promise(resolveWait => setTimeout(resolveWait, 1000));
      }
    }
  }
} finally {
  if (activeContainer) docker(['rm', '--force', activeContainer]);
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  if (interrupted) process.exitCode = 130;
  console.log(`\nSaved report: ${resolve(output, 'report.html')}`);
}
