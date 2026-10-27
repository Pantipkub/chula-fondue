import assert from 'node:assert/strict';
import { lookup } from 'node:dns/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const mode = process.argv[2];
const snapshotPath = process.argv[3] ?? '/tmp/chula-fondue-discovery.json';
const base = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 3000}`;

async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(5000),
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(result)}`);
  return result;
}

async function retryRead(path) {
  const end = Date.now() + 15000;
  for (;;) {
    try {
      return await request(path);
    } catch (error) {
      if (Date.now() >= end) throw error;
      await setTimeout(500);
    }
  }
}

async function dns() {
  assert.equal(process.env.DEPARTMENT_SERVICE_URL, 'http://department-service:3001');
  assert.equal(process.env.TICKET_SERVICE_URL, 'ticket-service:50051');
  const result = {};
  for (const service of ['department-service', 'ticket-service']) {
    result[service] = await lookup(service, { all: true });
    assert.ok(result[service].length > 0, `${service} resolves`);
  }
  console.log(JSON.stringify({ check: 'DNS', status: 'PASS', addresses: result }, null, 2));
  return result;
}

try {
  assert.ok(['dns', 'seed', 'verify'].includes(mode), 'Use discovery-demo.mjs dns|seed|verify [snapshot-path] inside api-gateway');
  const addresses = await dns();
  if (mode === 'seed') {
    assert.ok(!existsSync(snapshotPath), `Snapshot already exists: ${snapshotPath}; use verify or choose another snapshot path`);
    const department = await request('/departments', 'POST', {
      name: `Person 1 discovery ${randomUUID()}`,
      contactEmail: 'person1-discovery@example.com',
      buildings: ['DISCOVERY-DEMO'],
    });
    const ticket = await request('/tickets', 'POST', {
      category: 'Discovery demo',
      location: 'DISCOVERY-DEMO',
      description: 'Isolated Person 1 persistence fixture',
      reporterEmail: 'person1-reporter@example.com',
    });
    const assigned = await request(`/tickets/${ticket.id}/assign`, 'POST', { departmentId: department.id });
    assert.equal(assigned.status, 'ASSIGNED');
    assert.equal(assigned.departmentId, department.id);
    const history = await request(`/tickets/${ticket.id}/history`);
    assert.deepEqual(history.history.map((entry) => entry.toStatus), ['SUBMITTED', 'ASSIGNED']);
    writeFileSync(snapshotPath, JSON.stringify({ department, history, addresses }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ check: 'SEED', status: 'PASS', departmentId: department.id, ticketId: ticket.id, historyEntries: history.history.length, snapshotPath }, null, 2));
  } else if (mode === 'verify') {
    const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const department = await retryRead(`/departments/${expected.department.id}`);
    const history = await retryRead(`/tickets/${expected.history.ticket.id}/history`);
    assert.deepEqual(department, expected.department, 'Department survives recreation unchanged');
    assert.deepEqual(history, expected.history, 'Ticket and history survive recreation unchanged');
    console.log(JSON.stringify({ check: 'PERSISTENCE_AND_CONNECTIVITY', status: 'PASS', departmentId: department.id, ticketId: history.ticket.id, ticketStatus: history.ticket.status, historyEntries: history.history.length, snapshotPath }, null, 2));
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
