import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { photoForm, eventually } from './e2e.mjs';

assert.equal(process.env.FONDUE_ENV_FILE, '.env.demo', 'Run only against the isolated demo');
assert.ok(process.env.ADMIN_PASSWORD, 'Set ADMIN_PASSWORD in .env.demo before running platform tests');
const base = process.env.API_URL ?? 'http://localhost:3100';
const run = randomUUID().slice(0, 8);
const password = randomBytes(24).toString('hex');
const evidence = [];
async function call(path, { token, method = 'GET', json, form, key, expected = 200 } = {}) {
  const response = await fetch(base + path, { method, headers: {
    ...(token && { Authorization: `Bearer ${token}` }), ...(json && { 'Content-Type': 'application/json' }), ...(key && { 'Idempotency-Key': key }),
  }, body: form ?? (json && JSON.stringify(json)), signal: AbortSignal.timeout(15000) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  evidence.push({ path, method, status: response.status, expected });
  assert.equal(response.status, expected, `${method} ${path}: unexpected status ${response.status}`);
  return data;
}
const login = async (email, pass = password) => (await call('/auth/login', { method: 'POST', json: { email, password: pass } })).accessToken;
const admin = await login(process.env.ADMIN_EMAIL ?? 'admin@fondue.test', process.env.ADMIN_PASSWORD);
const department = async label => call('/departments', { token: admin, method: 'POST', expected: 201, json: { name: `${label} ${run}`, contactEmail: `${label}-${run}@example.test` } });
const a = await department('Platform-A'); const b = await department('Platform-B');
async function staff(label, dept) {
  const email = `${label}-${run}@example.test`;
  const user = await call('/auth/users', { token: admin, method: 'POST', expected: 201, json: { email, password, role: 'STAFF', departmentId: dept.id } });
  return { ...user, token: await login(email) };
}
const worker = await staff('worker', a); const peer = await staff('peer', a); const outsider = await staff('outsider', b);
const email = `reporter-platform-${run}@example.test`;
const reporterUser = await call('/auth/register', { method: 'POST', expected: 201, json: { email, password } });
let reporter = await login(email);
const fields = { category: `Platform manual ${run}`, location: 'Library', description: `Idempotent report ${run}` };
const key = randomUUID();
const submitted = await Promise.all(Array.from({ length: 5 }, () => call('/tickets', { token: reporter, method: 'POST', form: photoForm(fields), key, expected: 201 })));
assert.equal(new Set(submitted.map(t => t.id)).size, 1);
const ticket = submitted[0];
await call('/tickets', { token: reporter, method: 'POST', form: photoForm({ ...fields, description: 'Changed' }), key, expected: 409 });
await call('/tickets', { token: reporter, method: 'POST', form: photoForm(fields), key: 'invalid', expected: 400 });
await call(`/tickets/${ticket.id}/assign`, { token: admin, method: 'POST', json: { departmentId: a.id } });
const notification = await eventually(async () => (await call('/notifications', { token: worker.token })).find(n => n.ticketId === ticket.id && n.status === 'ASSIGNED'));
assert.equal(notification.recipientDepartmentId, a.id);
assert.notEqual(notification.recipientEmail, worker.email);
await call(`/notifications/${notification.eventId}/read`, { token: worker.token, method: 'PUT', expected: 204 });
assert.equal((await call('/notifications', { token: worker.token })).find(n => n.eventId === notification.eventId).read, true);
assert.equal((await call('/notifications', { token: peer.token })).find(n => n.eventId === notification.eventId).read, false);
assert.ok(!(await call(`/notifications?recipientDepartmentId=${a.id}&recipientEmail=${encodeURIComponent(a.contactEmail)}`, { token: outsider.token })).some(n => n.ticketId === ticket.id));
await call(`/notifications/${notification.eventId}/read`, { token: outsider.token, method: 'PUT', expected: 404 });
await call(`/auth/users/${worker.id}`, { token: reporter, method: 'PUT', json: { role: 'ADMIN' }, expected: 403 });
await call(`/auth/users/${worker.id}`, { token: admin, method: 'PUT', json: { departmentId: b.id } });
await call('/auth/me', { token: worker.token, expected: 401 });
worker.token = await login(worker.email);
await call(`/tickets/${ticket.id}/history`, { token: worker.token, expected: 403 });
await call(`/departments/${a.id}`, { token: admin, method: 'DELETE', expected: 409 });
await call(`/auth/users/${peer.id}`, { token: admin, method: 'PUT', json: { active: false } });
await call('/auth/me', { token: peer.token, expected: 401 });
await call('/auth/login', { method: 'POST', json: { email: peer.email, password }, expected: 401 });
await call(`/departments/${a.id}`, { token: admin, method: 'DELETE', expected: 409 });
await call(`/tickets/${ticket.id}`, { token: reporter, method: 'DELETE' });
await call(`/departments/${a.id}`, { token: admin, method: 'DELETE', expected: 204 });
await call(`/departments/${a.id}`, { token: admin, expected: 404 });
assert.equal((await call(`/departments/${a.id}?includeInactive=true`, { token: admin })).active, false);
assert.ok((await call('/departments?includeInactive=true', { token: admin })).some(d => d.id === a.id && !d.active));
await call('/auth/users', { token: admin, method: 'POST', expected: 400, json: { email: `inactive-${run}@example.test`, password, role: 'STAFF', departmentId: a.id } });
await call(`/departments/${a.id}`, { token: admin, method: 'PUT', json: { active: true } });
assert.equal((await call(`/departments/${a.id}`, { token: admin })).active, true);
const me = await call('/auth/me', { token: admin });
await call(`/auth/users/${me.sub}`, { token: admin, method: 'PUT', json: { active: false }, expected: 409 });
await call(`/auth/users/${worker.id}`, { token: admin, method: 'PUT', json: { active: null }, expected: 400 });
const forgot = await call('/auth/forgot-password', { method: 'POST', json: { email } });
assert.deepEqual(forgot, await call('/auth/forgot-password', { method: 'POST', json: { email: `missing-${run}@example.test` } }));
const mongo = await new MongoClient(`mongodb://127.0.0.1:${process.env.MONGO_PORT ?? 27020}`, { serverSelectionTimeoutMS: 5000 }).connect();
try {
  const mail = await eventually(() => mongo.db('notification').collection('notifications').findOne({ kind: 'PASSWORD_RESET', recipientEmail: email }));
  assert.equal(mail.delivery, 'RECORDED');
  const inbox = await call('/notifications', { token: admin });
  assert.ok(!inbox.some(n => n.eventId === mail.eventId || 'resetUrl' in n));
  const reset = new URL(mail.resetUrl).searchParams.get('token');
  const resetPassword = randomBytes(24).toString('hex');
  await call('/auth/reset-password', { method: 'POST', json: { token: reset, password: resetPassword } });
  await call('/auth/reset-password', { method: 'POST', json: { token: reset, password }, expected: 400 });
  await call('/auth/me', { token: reporter, expected: 401 });
  await call('/auth/login', { method: 'POST', json: { email, password }, expected: 401 });
  reporter = await login(email, resetPassword);
  await call('/auth/password', { token: reporter, method: 'POST', json: { currentPassword: 'incorrect', password }, expected: 401 });
  await call('/auth/me', { token: reporter });
  await call('/auth/password', { token: reporter, method: 'POST', json: { currentPassword: resetPassword, password } });
  await call('/auth/me', { token: reporter, expected: 401 });
  reporter = await login(email);
  await call('/auth/logout', { token: reporter, method: 'POST' });
  await call('/auth/me', { token: reporter, expected: 401 });
} finally { await mongo.close(); }
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/platform-e2e.json', JSON.stringify({ run, passed: evidence.length, evidence }, null, 2));
console.log(`PASS: ${evidence.length} platform API assertions (including real mail outbox → MongoDB)`);
