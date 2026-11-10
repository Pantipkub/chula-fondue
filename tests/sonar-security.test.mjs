import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RecoveryController, validRecipient } from '../services/notification-service/dist/recovery.controller.js';
import { AutoRoutingService, validRoutingEmail } from '../services/ticket-service/dist/auto-routing.service.js';
import { buildEmail } from '../services/notification-service/dist/email-template.js';
import { RpcException } from '@nestjs/microservices';

for (const [service, variable, entry] of [
  ['auth-service', 'AUTH_DATABASE_URL', 'app.module'],
  ['department-service', 'DEPARTMENT_DATABASE_URL', 'app.module'],
  ['ticket-service', 'TICKET_DATABASE_URL', 'app.module'],
  ['analytics-service', 'ANALYTICS_DATABASE_URL', 'main'],
]) {
  test(`${service} rejects missing/blank database configuration before starting`, () => {
    for (const value of [undefined, '   ']) {
      const env = { ...process.env, JWT_SECRET: randomBytes(32).toString('hex') };
      if (value === undefined) delete env[variable]; else env[variable] = value;
      const result = spawnSync(process.execPath, [`services/${service}/dist/${entry}.js`], { env, encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`${variable} is required`));
    }
  });
}

test('email checks reject malformed and oversized input without backtracking', () => {
  for (const validate of [validRecipient, validRoutingEmail]) {
    for (const value of ['staff@example.test', 'staff+repairs@dept.example.test']) assert.equal(validate(value), true);
    for (const value of [undefined, {}, '', '@example.test', 'a@@b.test', 'a@b', 'a@.test', 'a@b.', 'a @b.test', 'a@b.test\n', 'a'.repeat(500000)]) assert.equal(validate(value), false);
  }
});

test('recovery mail rejects foreign origins, malformed recipient and expired token shapes before storing', async () => {
  const stored = [];
  const controller = new RecoveryController({ collection: async () => ({ updateOne: async (...args) => stored.push(args) }) });
  const origin = process.env.WEB_PUBLIC_URL ?? 'http://localhost:8080';
  const body = { eventId: randomUUID(), recipientEmail: 'reporter@example.test', resetUrl: `${origin}/reset-password?token=${randomBytes(32).toString('hex')}`, expiresAt: new Date(Date.now() + 1800000).toISOString() };
  for (const invalid of [{ ...body, recipientEmail: 'invalid' }, { ...body, resetUrl: 'https://foreign.example/reset-password' }, { ...body, resetUrl: `${origin}/reset-password?token=bad` }]) {
    await assert.rejects(() => controller.accept(invalid), error => error.getStatus() === 400);
  }
  assert.equal(stored.length, 0);
  await controller.accept(body);
  assert.equal(stored[0][1].$setOnInsert.recipientEmail, body.recipientEmail);
  assert.equal(stored[0][2].upsert, true);
});

test('notification links trim trailing slashes and retain escaped HTML and recipient routes', () => {
  const old = process.env.WEB_PUBLIC_URL;
  process.env.WEB_PUBLIC_URL = 'https://fondue.example/base' + '/'.repeat(10000);
  try {
    const event = { eventId: 'test', ticketId: 'ticket', recipientEmail: 'staff@example.test', description: '<script>&"\'\nsecond line', status: 'ASSIGNED' };
    const email = buildEmail(event);
    assert.ok(email.html.includes('https://fondue.example/base/staff/tickets/ticket'));
    assert.ok(email.html.includes('&lt;script&gt;&amp;&quot;&#39;<br>second line'));
    assert.ok(!email.html.includes('<script>'));
  } finally { if (old === undefined) delete process.env.WEB_PUBLIC_URL; else process.env.WEB_PUBLIC_URL = old; }
});

test('routing worker preserves retry delays, exhausted claims and stale-write protection', async () => {
  const previous = process.env.AUTO_ROUTING_ENABLED;
  process.env.AUTO_ROUTING_ENABLED = 'true';
  const oldFetch = globalThis.fetch;
  try {
    for (const [attempts, exhausted, response, expected, delay] of [
      [1, false, new Response('', { status: 503 }), 'SERVICE_UNAVAILABLE', 5000],
      [5, false, new Response('', { status: 503 }), 'RETRIES_EXHAUSTED', undefined],
      [1, false, new Response('{}'), 'INVALID_RULE', undefined],
      [5, true, undefined, 'RETRIES_EXHAUSTED', undefined],
    ]) {
      const completed = [];
      const service = new AutoRoutingService({}, { finishRouting: async (...args) => completed.push(args) });
      const claim = { ticket: { id: 'ticket', category: 'Electrical' }, token: 'lease', requestId: 'request', attempts, exhausted };
      let pending = true;
      service.claim = async () => { if (!pending) return; pending = false; return claim; };
      globalThis.fetch = async () => response;
      await service.tick();
      assert.deepEqual(completed[0], [claim, expected, delay].slice(0, exhausted ? 2 : 3));
    }
    let writes = 0;
    const stale = new AutoRoutingService({}, { finishRouting: async () => { writes++; throw new RpcException('stale'); } });
    let pending = true;
    stale.claim = async () => { if (!pending) return; pending = false; return { ticket: {}, exhausted: true }; };
    await stale.tick();
    assert.equal(writes, 1, 'a lost lease must never be rescheduled');
  } finally {
    globalThis.fetch = oldFetch;
    if (previous === undefined) delete process.env.AUTO_ROUTING_ENABLED; else process.env.AUTO_ROUTING_ENABLED = previous;
  }
});

test('Cloudinary upload signs the exact transmitted timestamp using SHA-256', async () => {
  const oldUrl = process.env.CLOUDINARY_URL;
  const oldFetch = globalThis.fetch;
  const secret = randomBytes(24).toString('hex');
  process.env.CLOUDINARY_URL = `cloudinary://test-key:${secret}@test-cloud`;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
      assert.equal(init.body.get('api_key'), 'test-key');
      const signature = createHash('sha256').update(`timestamp=${init.body.get('timestamp')}${secret}`).digest('hex');
      assert.equal(init.body.get('signature'), signature);
      assert.equal(signature.length, 64);
      return new Response(JSON.stringify({ secure_url: 'https://images.example/photo.png' }));
    };
    const { storePhotos } = await import('../services/api-gateway/dist/photo-storage.js?sha256-test');
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(await storePhotos([{ buffer, originalname: 'photo.png' }]), ['https://images.example/photo.png']);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.CLOUDINARY_URL; else process.env.CLOUDINARY_URL = oldUrl;
  }
});
