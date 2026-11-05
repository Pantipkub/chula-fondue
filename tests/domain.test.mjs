import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../services/analytics-service/dist/analytics.js';
import { AuthRateLimit } from '../services/api-gateway/dist/rate-limit.js';
import { GmailClient, rawMessage } from '../services/notification-service/dist/email.service.js';

test('MTTR uses resolvedAt; confirmation delay cannot inflate it', () => {
  const result = aggregate([{ ticketId: 'one', version: 3, category: 'Electrical', location: 'Engineering', departmentId: 'd', departmentName: 'Facilities', status: 'CLOSED', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-10T00:00:00Z', resolvedAt: '2026-01-01T02:00:00Z' }]);
  assert.equal(result.mttrHours, 2);
  assert.equal(result.closedRate, 100);
  assert.equal(result.hotspots[0].name, 'Engineering');
});
test('empty analytics and reopened tickets have no completed resolution duration', () => {
  assert.equal(aggregate([]).mttrHours, null);
  assert.equal(aggregate([]).closedRate, 0);
  assert.equal(aggregate([{ status: 'IN_PROGRESS', resolvedAt: '', createdAt: '2026-01-01', location: 'A', category: 'B' }]).resolvedCount, 0);
});
test('rate limit expires and separates clients', () => {
  process.env.AUTH_RATE_LIMIT = '2';
  const limiter = new AuthRateLimit();
  limiter.check('a', 1000); limiter.check('a', 1001);
  assert.throws(() => limiter.check('a', 1002), /Too many/);
  assert.doesNotThrow(() => limiter.check('b', 1003));
  assert.doesNotThrow(() => limiter.check('a', 61001));
  delete process.env.AUTH_RATE_LIMIT;
});
test('email encoding handles Thai and refuses header injection', () => {
  const event = { eventId: 'event-1', ticketId: 'ticket-1', recipientEmail: 'reporter@example.com', status: 'RESOLVED', description: 'ซ่อมเสร็จแล้ว' };
  const raw = Buffer.from(rawMessage(event, 'sender@example.com'), 'base64url').toString();
  assert.match(raw, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(raw, /Message-ID: <event-1@chula-fondue.local>/);
  assert.throws(() => rawMessage({ ...event, recipientEmail: 'x@example.com\r\nBcc: y@example.com' }, 'sender@example.com'));
});
test('Gmail integration refreshes OAuth once and sends base64url MIME', async () => {
  Object.assign(process.env, { GMAIL_CLIENT_ID: 'test', GMAIL_CLIENT_SECRET: 'test', GMAIL_REFRESH_TOKEN: 'test', GMAIL_FROM: 'sender@example.com' });
  const calls = [];
  const client = new GmailClient(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(url.includes('oauth2') ? { access_token: 'fake-test-token', expires_in: 3600 } : { id: 'message-id' }), { status: 200 });
  });
  const event = { eventId: 'id', ticketId: 'ticket', recipientEmail: 'reporter@example.com', status: 'RESOLVED', description: 'fixed' };
  assert.equal(await client.send(event), 'message-id');
  await client.send(event);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer fake-test-token');
  assert.ok(JSON.parse(calls[1].init.body).raw);
  for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM']) delete process.env[key];
});
