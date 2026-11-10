import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';

process.env.JWT_SECRET ||= randomBytes(32).toString('hex');
const { NotificationsController } = await import('../services/api-gateway/dist/notifications.controller.js');

test('notification gateway scopes reporter/staff requests and leaves admin audience filtering to the service', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return Response.json([{ eventId: 'notification' }]); };
  try {
    const controller = new NotificationsController();
    for (const role of ['REPORTER', 'STAFF', 'ADMIN']) {
      const user = { sub: 'viewer', email: 'viewer@example.test', role, departmentId: 'department' };
      assert.deepEqual(await controller.list(user), [{ eventId: 'notification' }]);
      const { url } = requests.at(-1);
      assert.equal(url.searchParams.get('viewerId'), 'viewer');
      assert.equal(url.searchParams.get('recipientEmail'), role === 'ADMIN' ? null : user.email);
      assert.equal(url.searchParams.get('recipientDepartmentId'), role === 'STAFF' ? 'department' : null);
    }
    await controller.read({ sub: 'viewer', role: 'REPORTER', email: 'viewer@example.test' }, 'event/with space');
    assert.equal(requests.at(-1).url.pathname, '/notifications/event%2Fwith%20space/read');
    assert.equal(requests.at(-1).init.method, 'PUT');
  } finally { globalThis.fetch = original; }
});

test('notification gateway preserves not-found responses and maps failures to service unavailable', async () => {
  const original = globalThis.fetch;
  const user = { sub: 'viewer', role: 'REPORTER', email: 'viewer@example.test' };
  const controller = new NotificationsController();
  try {
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(() => controller.read(user, 'missing'), error => error.getStatus() === 404);
    globalThis.fetch = async () => new Response('', { status: 500 });
    await assert.rejects(() => controller.list(user), error => error.getStatus() === 503);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(() => controller.list(user), error => error.getStatus() === 503);
  } finally { globalThis.fetch = original; }
});
