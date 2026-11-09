import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const base = process.env.API_URL ?? 'http://localhost:3100';
const run = Date.now().toString(36);
const password = 'FondueTest!2026';
const evidence = [];
export async function call(path, { token, method = 'GET', json, form, expected = 200 } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, { method, headers, body: form ?? (json ? JSON.stringify(json) : undefined), signal: AbortSignal.timeout(15000) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  evidence.push({ method, path, status: response.status, expected });
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
export function photoForm(fields = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  form.set('photos', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSTsAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
  return form;
}
export async function eventually(fn, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 1000)); }
  throw Error('Timed out waiting for asynchronous processing');
}
async function account(label) {
  const email = `${label}-${run}@example.test`;
  await call('/auth/register', { method: 'POST', json: { email, password }, expected: 201 });
  return (await call('/auth/login', { method: 'POST', json: { email, password }, expected: 200 })).accessToken;
}
async function main() {
  await call('/health/ready');
  await call('/tickets', { expected: 401 });
  const admin = (await call('/auth/login', { method: 'POST', json: { email: process.env.ADMIN_EMAIL ?? 'admin@fondue.test', password: process.env.ADMIN_PASSWORD ?? 'FondueDemo!2026' }, expected: 200 })).accessToken;
  const reporter = await account('reporter'); const other = await account('other');
  const department = await call('/departments', { token: admin, method: 'POST', json: { name: `Facilities ${run}`, contactEmail: `staff-${run}@example.test`, buildings: ['Engineering'] }, expected: 201 });
  const second = await call('/departments', { token: admin, method: 'POST', json: { name: `Other ${run}`, contactEmail: `other-staff-${run}@example.test`, buildings: ['Library'] }, expected: 201 });
  async function staff(dept, label) {
    const email = `${label}-${run}@example.test`;
    await call('/auth/users', { token: admin, method: 'POST', json: { email, password, role: 'STAFF', departmentId: dept.id }, expected: 201 });
    return (await call('/auth/login', { method: 'POST', json: { email, password }, expected: 200 })).accessToken;
  }
  const worker = await staff(department, 'worker'); const wrongWorker = await staff(second, 'wrong-worker');
  await call('/departments', { token: reporter, expected: 403 });
  await call('/analytics', { token: reporter, expected: 403 });
  await call('/tickets', { token: reporter, method: 'POST', json: { category: 'Electrical', location: 'Engineering', description: 'No image' }, expected: 400 });
  const fields = { category: `Manual test ${run}`, location: 'Engineering', description: `Broken light ${run}` };
  const ticket = await call('/tickets', { token: reporter, method: 'POST', form: photoForm(fields), expected: 201 });
  const id = ticket.id;
  await call(`/tickets/${id}/history`, { token: other, expected: 403 });
  await call(`/tickets/${id}/assign`, { token: reporter, method: 'POST', json: { departmentId: department.id }, expected: 403 });
  await call(`/tickets/${id}/category`, { token: admin, method: 'POST', json: { category: 'Building' } });
  // Isolate manual workflow assertions from the asynchronous routing transition.
  await eventually(async () => !['PENDING', 'RETRY'].includes((await call(`/tickets/${id}/history`, { token: reporter })).ticket.routingStatus));
  await call(`/tickets/${id}/assign`, { token: admin, method: 'POST', json: { departmentId: department.id } });
  await call(`/tickets/${id}/start`, { token: wrongWorker, method: 'POST', expected: 403 });
  const starts = await Promise.all([1, 2].map(async () => {
    const response = await fetch(base + `/tickets/${id}/start`, { method: 'POST', headers: { Authorization: `Bearer ${worker}` } });
    await response.text(); return response.status;
  }));
  assert.deepEqual(starts.sort(), [200, 409], 'concurrent start requests must not both commit');
  await call(`/tickets/${id}`, { token: reporter, method: 'DELETE', expected: 409 });
  for (const status of starts) evidence.push({ method: 'POST', path: `/tickets/${id}/start`, status, expected: status });
  await call(`/tickets/${id}/start`, { token: worker, method: 'POST', expected: 409 });
  await call(`/tickets/${id}/resolve`, { token: worker, method: 'POST', expected: 400 });
  await call(`/tickets/${id}/resolve`, { token: worker, method: 'POST', form: photoForm() });
  await call(`/tickets/${id}/reopen`, { token: reporter, method: 'POST', json: { reason: '' }, expected: 400 });
  await call(`/tickets/${id}/reopen`, { token: reporter, method: 'POST', json: { reason: 'Still flickering' } });
  const resolved = await call(`/tickets/${id}/resolve`, { token: worker, method: 'POST', form: photoForm() });
  const closed = await call(`/tickets/${id}/confirm`, { token: reporter, method: 'POST' });
  assert.equal(closed.status, 'CLOSED'); assert.equal(closed.resolvedAt, resolved.resolvedAt);
  const history = await call(`/tickets/${id}/history`, { token: reporter });
  assert.ok(history.history.length >= 8);
  const hidden = await call('/tickets?reporterEmail=forged@example.test', { token: other });
  assert.ok(!hidden.tickets.some(t => t.id === id));
  const guest = (await call('/auth/guest', { method: 'POST', expected: 200 })).accessToken;
  await call(`/tickets/${id}/history`, { token: guest, expected: 403 });
  // Guests must sign in before reporting: their anonymous token cannot be recovered to track the ticket later.
  await call('/tickets', { token: guest, method: 'POST', form: photoForm(fields), expected: 403 });
  await call('/tickets', { token: guest, expected: 403 });
  await call(`/tickets/${id}`, { token: guest, method: 'DELETE', expected: 403 });
  const cancel = await call('/tickets', { token: reporter, method: 'POST', form: photoForm(fields), expected: 201 });
  await call(`/tickets/${cancel.id}`, { token: reporter, method: 'DELETE' });
  const reject = await call('/tickets', { token: reporter, method: 'POST', form: photoForm(fields), expected: 201 });
  await call(`/tickets/${reject.id}/reject`, { token: admin, method: 'POST', json: { reason: 'Duplicate report' } });
  await eventually(async () => {
    const notifications = await call('/notifications', { token: admin });
    return notifications.some(n => n.ticketId === id && n.status === 'CLOSED');
  });
  const report = await eventually(async () => {
    const stats = await call(`/analytics?departmentId=${department.id}`, { token: admin });
    return stats.byStatus.some(s => s.name === 'CLOSED') ? stats : null;
  });
  assert.ok(report.mttrHours >= 0); assert.ok(report.resolvedCount >= 1);
  await call('/analytics?from=not-a-date', { token: admin, expected: 400 });
  const editable = await call('/departments', { token: admin, method: 'POST', json: { name: `Editable ${run}`, contactEmail: 'editable@example.test', buildings: [] }, expected: 201 });
  const updated = await call(`/departments/${editable.id}`, { token: admin, method: 'PUT', json: { name: `Updated ${run}` } });
  assert.equal(updated.name, `Updated ${run}`);
  await call(`/departments/${editable.id}`, { token: admin, method: 'DELETE', expected: 204 });
  await call(`/departments/${editable.id}`, { token: admin, expected: 404 });
  const badPhoto = new FormData();
  Object.entries(fields).forEach(([k, v]) => badPhoto.set(k, v));
  badPhoto.set('photos', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
  await call('/tickets', { token: reporter, method: 'POST', form: badPhoto, expected: 400 });
  const manyPhotos = photoForm(fields);
  const image = manyPhotos.get('photos');
  for (let i = 0; i < 5; i++) manyPhotos.append('photos', image, 'extra.png');
  await call('/tickets', { token: reporter, method: 'POST', form: manyPhotos, expected: 400 });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/e2e.json', JSON.stringify({ run, passed: evidence.length, evidence }, null, 2));
  console.log(`PASS: ${evidence.length} API assertions; evidence saved in test-results/e2e.json`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
