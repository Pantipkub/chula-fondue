import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { call, eventually, photoForm } from './e2e.mjs';

// Only the disposable, explicitly named local demo project. Always recover stopped services.
const docker = (...command) => execFileSync('docker', ['compose', '--env-file', '.env.demo', '-p', 'fondue-demo', ...command], { stdio: 'pipe' });
const base = process.env.API_URL ?? 'http://localhost:3100';
const run = Date.now();
const admin = (await call('/auth/login', { method: 'POST', json: { email: process.env.ADMIN_EMAIL ?? 'admin@fondue.test', password: process.env.ADMIN_PASSWORD ?? 'FondueDemo!2026' } })).accessToken;
const email = `routing-recovery-${run}@example.test`;
await call('/auth/register', { method: 'POST', json: { email, password: 'RecoveryTest!2026' }, expected: 201 });
const reporter = (await call('/auth/login', { method: 'POST', json: { email, password: 'RecoveryTest!2026' } })).accessToken;
const rules = await call('/routing-rules', { token: admin });
const rule = rules.find(r => r.category === 'IT / Network' && r.enabled);
assert.ok(rule, 'Create an enabled IT / Network rule first');
let stopped = false;
try {
  docker('stop', 'department-service'); stopped = true;
  const ticket = await call('/tickets', { token: reporter, method: 'POST', form: photoForm({ category: 'IT / Network', location: 'Routing recovery', description: `Service outage ${run}` }), expected: 201 });
  assert.equal(ticket.routingStatus, 'PENDING');
  await eventually(async () => (await call(`/tickets/${ticket.id}/history`, { token: reporter })).ticket.routingStatus === 'RETRY');
  docker('restart', 'ticket-service');
  const read = async () => {
    const response = await fetch(`${base}/tickets/${ticket.id}/history`, { headers: { Authorization: `Bearer ${reporter}` }, signal: AbortSignal.timeout(8000) });
    return response.ok ? response.json() : null;
  };
  const pending = await eventually(async () => {
    try { const result = await read(); return result?.ticket.routingStatus === 'RETRY' ? result : null; } catch { return null; }
  }, 45000);
  assert.equal(pending.ticket.status, 'SUBMITTED', 'ticket and retry survive process restart');
  docker('start', 'department-service'); stopped = false;
  const result = await eventually(async () => {
    const value = await read(); return value?.ticket.status === 'ASSIGNED' ? value : null;
  }, 60000);
  assert.equal(result.ticket.departmentId, rule.departmentId);
  assert.equal(result.ticket.assignmentSource, 'AUTO');
  assert.equal(result.history.filter(h => h.toStatus === 'ASSIGNED').length, 1);
  await eventually(async () => (await call('/notifications', { token: admin })).some(n => n.ticketId === ticket.id && n.status === 'ASSIGNED'));
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/routing-recovery.json', JSON.stringify({ passed: true, ticketId: ticket.id, departmentOutage: true, processRestart: true }, null, 2));
  console.log('PASS: submission during Department outage, persistent retry after Ticket restart and automatic assignment on recovery');
} finally { if (stopped) docker('start', 'department-service'); }
