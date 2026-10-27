import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
const fixturePath = '/tmp/chula-fondue-resilience.json';
const base = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 3000}`;
const trace = `person2-${randomUUID()}`;

async function http(path, method = 'GET', body, requestId = trace) {
  const started = performance.now();
  const response = await fetch(base + path, {
    method, signal: AbortSignal.timeout(5500),
    headers: { 'x-request-id': requestId, ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.headers.get('x-request-id'), requestId, 'request ID echoed');
  return { status: response.status, data, durationMs: Math.round(performance.now() - started) };
}

function report(check, detail = {}) {
  console.log(JSON.stringify({ check, status: 'PASS', ...detail }));
}

async function cancellationChecks() {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const grpc = await import('@grpc/grpc-js');
  const loader = await import('@grpc/proto-loader');
  const definition = loader.loadSync(fileURLToPath(new URL('../proto/ticket.proto', import.meta.url)));
  const { ticket } = grpc.loadPackageDefinition(definition);
  const client = new ticket.TicketService(process.env.TICKET_SERVICE_URL ?? 'localhost:50051', grpc.credentials.createInsecure(), { 'grpc.enable_retries': 0 });
  try {
    for (const kind of ['short-deadline', 'explicit-cancellation']) {
      const metadata = new grpc.Metadata();
      metadata.set('x-request-id', `${trace}-${kind}`);
      let timer;
      const started = performance.now();
      try {
        const error = await new Promise((resolve) => {
          const call = client.assignTicket({ id: fixture.ticket.id, departmentId: fixture.department.id }, metadata,
            { deadline: Date.now() + (kind === 'short-deadline' ? 400 : 3000) },
            (error) => resolve(error));
          if (kind === 'explicit-cancellation') timer = setTimeout(() => call.cancel(), 150);
        });
        assert.equal(error?.code, kind === 'short-deadline' ? grpc.status.DEADLINE_EXCEEDED : grpc.status.CANCELLED);
        const durationMs = Math.round(performance.now() - started);
        assert.ok(durationMs < 1000);
        assert.deepEqual((await http(`/tickets/${fixture.ticket.id}/history`)).data, fixture.before);
        report(kind, { grpcCode: error.code, durationMs, stateAndHistory: 'unchanged' });
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    client.close();
  }
}

async function ready(expected, department, ticket) {
  const result = await http('/ready');
  assert.equal(result.status, expected);
  assert.equal(result.data.dependencies.department.status, department);
  assert.equal(result.data.dependencies.ticket.status, ticket);
  assert.ok(result.durationMs < 1800, 'readiness is bounded independently of business request deadlines');
  assert.equal((await http('/health')).status, 200, 'liveness survives dependency failure');
  report('readiness_and_liveness', { httpStatus: result.status, durationMs: result.durationMs, dependencies: result.data.dependencies });
}

async function createTicket() {
  const result = await http('/tickets', 'POST', {
    category: 'Resilience fixture', location: 'PERSON2-DEMO',
    description: 'Isolated Person 2 fixture', reporterEmail: 'person2@example.com',
  });
  assert.equal(result.status, 201);
  return result.data;
}

async function healthDatabase(service) {
  await import('reflect-metadata');
  const root = new URL('../', import.meta.url);
  const { HealthController } = service === 'department-service'
    ? await import(new URL('services/department-service/dist/health.controller.js', root))
    : {};
  const { TicketsService } = service === 'ticket-service'
    ? await import(new URL('services/ticket-service/dist/tickets.service.js', root))
    : {};
  for (const kind of ['error', 'timeout']) {
    const database = { query: () => kind === 'error' ? Promise.reject(new Error('private-database-detail')) : new Promise(() => {}) };
    const started = performance.now();
    if (service === 'department-service') {
      const response = { code: 200, status(code) { this.code = code; } };
      const body = await new HealthController(database).ready(response);
      assert.equal(response.code, 503);
      assert.equal(body.dependencies.database.status, 'down');
      assert.ok(!JSON.stringify(body).includes('private-database-detail'));
    } else {
      const body = await new TicketsService(database, {}, {}).checkHealth();
      assert.equal(body.status, 'NOT_SERVING');
      assert.equal(body.databaseStatus, 'down');
      assert.ok(!JSON.stringify(body).includes('private-database-detail'));
    }
    const durationMs = Math.round(performance.now() - started);
    assert.ok(durationMs < 1500);
    report('database_health_fault', { service, kind, durationMs });
  }
}

try {
  if (mode === 'db-health') {
    const service = process.argv[3];
    assert.ok(['department-service', 'ticket-service'].includes(service));
    await healthDatabase(service);
  } else if (mode === 'prepare') {
    assert.ok(!existsSync(fixturePath), 'Use a fresh Gateway container for another prepare run');
    await ready(200, 'up', 'up');
    const name = `Person 2 ${randomUUID()}`;
    const department = await http('/departments', 'POST', { name, contactEmail: 'person2-department@example.com' });
    assert.equal(department.status, 201);
    assert.equal((await http('/departments', 'POST', { name, contactEmail: 'person2-department@example.com' })).status, 409);
    assert.equal((await http('/departments', 'POST', { name: `${name}-invalid`, contactEmail: 'invalid' })).status, 400);
    assert.equal((await http('/tickets', 'POST', {})).status, 400);
    assert.equal((await http('/tickets/not-found/history')).status, 404);
    const ticket = await createTicket();
    const assign = await http(`/tickets/${ticket.id}/assign`, 'POST', { departmentId: department.data.id }, trace);
    assert.equal(assign.status, 200);
    assert.equal(assign.data.status, 'ASSIGNED');
    assert.equal((await http(`/tickets/${ticket.id}`, 'DELETE')).status, 409);
    for (const [action, body, expected] of [
      ['start', {}, 'IN_PROGRESS'],
      ['resolve', { completionPhotoUrl: 'https://example.com/completed.jpg' }, 'RESOLVED'],
      ['reopen', { reason: 'Regression smoke test' }, 'IN_PROGRESS'],
      ['resolve', {}, 'RESOLVED'],
      ['confirm', {}, 'CLOSED'],
    ]) {
      const result = await http(`/tickets/${ticket.id}/${action}`, 'POST', body);
      assert.equal(result.status, 200);
      assert.equal(result.data.status, expected);
    }
    const cancel = await createTicket();
    assert.equal((await http(`/tickets/${cancel.id}`, 'DELETE')).data.status, 'CANCELLED');
    const reject = await createTicket();
    assert.equal((await http(`/tickets/${reject.id}/reject`, 'POST', { reason: 'Regression fixture' })).data.status, 'REJECTED');
    const failureTicket = await createTicket();
    const before = await http(`/tickets/${failureTicket.id}/history`);
    assert.equal((await http(`/tickets/${failureTicket.id}/assign`, 'POST', { departmentId: randomUUID() })).status, 404);
    assert.deepEqual((await http(`/tickets/${failureTicket.id}/history`)).data, before.data);
    await Promise.all(Array.from({ length: 8 }, (_, index) => http('/tickets', 'GET', undefined, `${trace}-parallel-${index}`)));
    writeFileSync(fixturePath, JSON.stringify({ department: department.data, ticket: failureTicket, before: before.data, trace }), { flag: 'wx' });
    report('happy_path_and_error_regression', { departmentId: department.data.id, failureTicketId: failureTicket.id, trace });
  } else if (mode === 'rpc-cancellation') {
    await cancellationChecks();
  } else if (['department-down', 'department-slow'].includes(mode)) {
    const expected = mode === 'department-slow' ? 504 : 503;
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    await ready(503, 'down', 'up');
    assert.equal((await http('/tickets')).status, 200, 'independent ticket route stays usable');
    const proxy = await http('/departments');
    assert.equal(proxy.status, expected);
    assert.ok(proxy.durationMs < 3200);
    const assign = await http(`/tickets/${fixture.ticket.id}/assign`, 'POST', { departmentId: fixture.department.id });
    assert.equal(assign.status, expected);
    assert.ok(assign.durationMs < 3200);
    if (mode === 'department-slow') {
      assert.ok(proxy.durationMs >= 1700 && assign.durationMs >= 1700, 'slow dependency exercises the 2-second timeout');
    }
    assert.deepEqual((await http(`/tickets/${fixture.ticket.id}/history`)).data, fixture.before);
    report(mode, { proxyStatus: proxy.status, proxyMs: proxy.durationMs, assignStatus: assign.status, assignMs: assign.durationMs, stateAndHistory: 'unchanged' });
  } else if (['ticket-down', 'ticket-slow'].includes(mode)) {
    await ready(503, 'up', 'down');
    assert.equal((await http('/departments')).status, 200, 'independent department route stays usable');
    const result = await http('/tickets');
    assert.equal(result.status, mode === 'ticket-slow' ? 504 : 503);
    assert.ok(result.durationMs < 4200);
    if (mode === 'ticket-slow') assert.ok(result.durationMs >= 2600, 'slow gRPC service exercises the real 3-second deadline');
    report(mode, { httpStatus: result.status, durationMs: result.durationMs });
  } else if (mode === 'recover') {
    await ready(200, 'up', 'up');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.deepEqual((await http(`/tickets/${fixture.ticket.id}/history`)).data, fixture.before);
    report('recovered_without_failed_assignment', { ticketId: fixture.ticket.id });
  } else {
    throw new Error('Expected prepare|department-down|department-slow|ticket-down|ticket-slow|rpc-cancellation|recover|db-health <service>');
  }
} catch (error) {
  console.error(JSON.stringify({ check: mode, status: 'FAIL', error: error.message }));
  process.exitCode = 1;
}
