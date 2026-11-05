import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { call, eventually, photoForm } from './e2e.mjs';
// Only operates on the explicitly named, disposable local demo Compose project.
const args = ['compose', '--env-file', '.env.demo', '-p', 'fondue-demo'];
const docker = (...command) => execFileSync('docker', [...args, ...command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const admin = (await call('/auth/login', { method: 'POST', json: { email: 'admin@fondue.test', password: process.env.ADMIN_PASSWORD ?? 'FondueDemo!2026' } })).accessToken;
const run = Date.now();
const email = `recovery-${run}@example.test`;
await call('/auth/register', { method: 'POST', json: { email, password: 'RecoveryTest!2026' }, expected: 201 });
const reporter = (await call('/auth/login', { method: 'POST', json: { email, password: 'RecoveryTest!2026' } })).accessToken;
const department = await call('/departments', { token: admin, method: 'POST', json: { name: `Recovery ${run}`, contactEmail: email, buildings: [] }, expected: 201 });
const ticket = await call('/tickets', { token: reporter, method: 'POST', form: photoForm({ category: 'Electrical', location: 'Recovery test', description: 'Broker outage fixture' }), expected: 201 });
let brokerStopped = false;
try {
  docker('stop', 'rabbitmq'); brokerStopped = true;
  const assigned = await call(`/tickets/${ticket.id}/assign`, { token: admin, method: 'POST', json: { departmentId: department.id } });
  assert.equal(assigned.status, 'ASSIGNED');
  await new Promise(resolve => setTimeout(resolve, 4000));
  const pending = docker('exec', '-T', 'postgres', 'psql', '-U', 'fondue', '-d', 'ticket', '-Atc', `SELECT count(*) FROM outbox_event WHERE payload->>'ticketId' = '${ticket.id}' AND "notificationSent" = false`);
  assert.ok(Number(pending.trim()) >= 1, 'committed notification remains in outbox while broker is down');
  docker('start', 'rabbitmq'); brokerStopped = false;
  await eventually(async () => (await call('/notifications', { token: admin })).some(n => n.ticketId === ticket.id && n.status === 'ASSIGNED'), 60000);
  // Simulate a resolution that is 8 days old; the production interval remains fixed at seven days.
  docker('exec', '-T', 'postgres', 'psql', '-U', 'fondue', '-d', 'ticket', '-c', `UPDATE ticket SET status='RESOLVED', "updatedAt"='2026-01-01T00:00:00.000Z', "resolvedAt"='2026-01-01T00:00:00.000Z' WHERE id='${ticket.id}'`);
  await eventually(async () => (await call(`/tickets/${ticket.id}/history`, { token: reporter })).ticket.status === 'CLOSED');
  const history = await call(`/tickets/${ticket.id}/history`, { token: reporter });
  assert.ok(history.history.some(h => h.note === 'Automatically closed after 7 days'));
  writeFileSync('test-results/recovery.json', JSON.stringify({ passed: true, brokerOutboxRecovery: true, sevenDayClosure: true, testedAt: new Date().toISOString() }, null, 2));
  console.log('PASS: broker outage/outbox replay and seven-day automatic closure');
} finally { if (brokerStopped) docker('start', 'rabbitmq'); }
