import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { call, eventually, photoForm } from './e2e.mjs';

const run = Date.now().toString(36);
const password = 'RoutingTest!2026';
const admin = (await call('/auth/login', { method: 'POST', json: { email: process.env.ADMIN_EMAIL ?? 'admin@fondue.test', password: process.env.ADMIN_PASSWORD ?? 'FondueDemo!2026' } })).accessToken;
async function user(role, departmentId) {
  const email = `routing-${role.toLowerCase()}-${departmentId?.slice(0, 8) ?? ''}-${run}@example.test`;
  if (role === 'REPORTER') await call('/auth/register', { method: 'POST', json: { email, password }, expected: 201 });
  else await call('/auth/users', { token: admin, method: 'POST', json: { email, password, role, departmentId }, expected: 201 });
  return (await call('/auth/login', { method: 'POST', json: { email, password } })).accessToken;
}
const reporter = await user('REPORTER');
const department = await call('/departments', { token: admin, method: 'POST', json: { name: `Routing IT ${run}`, contactEmail: `it-${run}@example.test`, buildings: [] }, expected: 201 });
const other = await call('/departments', { token: admin, method: 'POST', json: { name: `Routing other ${run}`, contactEmail: `other-${run}@example.test`, buildings: [] }, expected: 201 });
const staff = await user('STAFF', department.id);
const wrongStaff = await user('STAFF', other.id);
const rules = await call('/routing-rules', { token: admin });
const previous = rules.find(r => r.category === 'IT / Network' && r.enabled) ?? rules.find(r => r.category === 'IT / Network');
let rule;
try {
  const body = { category: 'IT / Network', departmentId: department.id, enabled: true };
  rule = previous
    ? await call(`/routing-rules/${previous.id}`, { token: admin, method: 'PUT', json: body })
    : await call('/routing-rules', { token: admin, method: 'POST', json: body, expected: 201 });
  await call('/routing-rules', { token: reporter, expected: 403 });
  await call('/routing-rules/match', { token: wrongStaff, method: 'POST', json: { category: 'IT / Network' }, expected: 403 });
  await call(`/routing-rules/${rule.id}`, { token: admin, method: 'PUT', json: { enabled: null }, expected: 400 });
  await call('/routing-rules', { token: admin, method: 'POST', json: body, expected: 409 });
  await call(`/departments/${department.id}`, { token: admin, method: 'DELETE', expected: 409 });
  const match = await call('/routing-rules/match', { token: admin, method: 'POST', json: { category: ' it / NETWORK ' } });
  assert.equal(match.department.id, department.id);
  const create = (category = 'IT / Network') => call('/tickets', { token: reporter, method: 'POST', form: photoForm({ category, location: 'Routing test', description: `Auto routing ${run}` }), expected: 201 });
  const assigned = async (id) => eventually(async () => {
    const result = await call(`/tickets/${id}/history`, { token: reporter });
    return result.ticket.status === 'ASSIGNED' ? result : null;
  }, 20000);
  const ticket = await create();
  assert.notEqual(ticket.routingStatus, 'NONE', 'Enable AUTO_ROUTING_ENABLED=true for this test');
  const result = await assigned(ticket.id);
  assert.equal(result.ticket.departmentId, department.id);
  assert.equal(result.ticket.assignmentSource, 'AUTO');
  assert.equal(result.ticket.routingRuleId, rule.id);
  assert.ok(!('departmentContactEmail' in result.ticket));
  assert.equal(result.history.filter(h => h.toStatus === 'ASSIGNED').length, 1);
  const queue = await call('/tickets', { token: staff });
  assert.ok(queue.tickets.some(t => t.id === ticket.id));
  await call(`/tickets/${ticket.id}/history`, { token: wrongStaff, expected: 403 });
  await call(`/tickets/${ticket.id}/retry-routing`, { token: reporter, method: 'POST', expected: 403 });
  await call(`/tickets/${ticket.id}`, { token: reporter, method: 'DELETE' });
  await call(`/tickets/${ticket.id}/start`, { token: staff, method: 'POST', expected: 409 });
  const manual = await create('Other');
  await eventually(async () => (await call(`/tickets/${manual.id}/history`, { token: reporter })).ticket.routingStatus === 'REVIEW');
  const review = await call(`/tickets/${manual.id}/history`, { token: reporter });
  assert.equal(review.ticket.routingReason, 'NO_RULE');
  await call(`/tickets/${manual.id}/category`, { token: admin, method: 'POST', json: { category: 'IT / Network' } });
  await assigned(manual.id);
  await call(`/tickets/${manual.id}/reject`, { token: admin, method: 'POST', json: { reason: 'Duplicate' } });
  await eventually(async () => {
    const notifications = await call('/notifications', { token: admin });
    return notifications.filter(n => n.ticketId === manual.id && n.status === 'REJECTED').length === 2;
  });
  const retried = await create('Other');
  await eventually(async () => (await call(`/tickets/${retried.id}/history`, { token: reporter })).ticket.routingStatus === 'REVIEW');
  await call(`/tickets/${retried.id}/retry-routing`, { token: admin, method: 'POST' });
  await eventually(async () => (await call(`/tickets/${retried.id}/history`, { token: reporter })).ticket.routingStatus === 'REVIEW');
  await call(`/tickets/${retried.id}/assign`, { token: admin, method: 'POST', json: { departmentId: other.id } });
  const overridden = await call(`/tickets/${retried.id}/history`, { token: reporter });
  assert.equal(overridden.ticket.assignmentSource, 'ADMIN');
  assert.equal(overridden.ticket.routingStatus, 'DONE');
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/routing-e2e.json', JSON.stringify({ passed: true, run, ticketId: ticket.id, ruleId: rule.id }, null, 2));
  console.log('PASS: routing API roles, automatic assignment, staff scope, review/retry, cancellation and multi-recipient rejection');
} finally {
  if (rule) await call(`/routing-rules/${rule.id}`, { token: admin, method: 'PUT', json: previous
    ? { departmentId: previous.departmentId, enabled: previous.enabled }
    : { enabled: false } });
}
