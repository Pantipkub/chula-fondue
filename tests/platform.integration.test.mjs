import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MongoClient } from 'mongodb';
import { User } from '../services/auth-service/dist/user.entity.js';
import { AuthMail, PasswordReset } from '../services/auth-service/dist/password-reset.entity.js';
import { AuthMailService } from '../services/auth-service/dist/auth-mail.service.js';
import { Department } from '../services/department-service/dist/department.entity.js';
import { RoutingRule } from '../services/department-service/dist/routing-rule.entity.js';
import { DepartmentsService } from '../services/department-service/dist/departments.service.js';
import { Ticket, TicketHistory } from '../services/ticket-service/dist/ticket.entity.js';
import { OutboxEvent } from '../services/ticket-service/dist/outbox.entity.js';
import { TicketRoutingJob } from '../services/ticket-service/dist/ticket-routing-job.entity.js';
import { TicketsService } from '../services/ticket-service/dist/tickets.service.js';
import { InboxController } from '../services/notification-service/dist/inbox.controller.js';
import { RecoveryController } from '../services/notification-service/dist/recovery.controller.js';

process.env.JWT_SECRET ||= randomBytes(32).toString('hex');
const { AuthService } = await import('../services/auth-service/dist/auth.service.js');
const demo = process.env.FONDUE_ENV_FILE === '.env.demo';
const pgUrl = process.env.PLATFORM_TEST_DATABASE_URL ?? (demo ? `postgresql://fondue:fondue@127.0.0.1:${process.env.POSTGRES_PORT ?? 5435}/ticket` : undefined);
const mongoUrl = process.env.PLATFORM_TEST_MONGODB_URL ?? (demo ? `mongodb://127.0.0.1:${process.env.MONGO_PORT ?? 27020}` : undefined);
const password = randomBytes(24).toString('hex');

test('platform lifecycle: real PostgreSQL transactions', { skip: !pgUrl }, async t => {
  const schema = `platform_test_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({ type: 'postgres', url: pgUrl, schema,
    entities: [User, AuthMail, PasswordReset, Department, RoutingRule, Ticket, TicketHistory, TicketRoutingJob, OutboxEvent] });
  const originalFetch = globalThis.fetch;
  const originalFlag = process.env.AUTO_ROUTING_ENABLED;
  process.env.AUTO_ROUTING_ENABLED = 'true';
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.synchronize();
    const users = db.getRepository(User);
    const auth = new AuthService(users);
    const departments = new DepartmentsService(db.getRepository(Department));
    const tickets = new TicketsService(db.getRepository(Ticket), db.getRepository(TicketHistory), { connect: async () => {} });
    let dependencyDown = false;
    let delivered = 0;
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname;
      if (dependencyDown) throw Error('simulated dependency outage');
      if (path.startsWith('/auth/department-usage/')) return Response.json(await auth.departmentUsage(path.split('/').pop()));
      if (path.endsWith('/usage')) return Response.json({ open: await db.getRepository(Ticket).countBy({ departmentId: path.split('/')[3], status: 'ASSIGNED' }) });
      if (path === '/internal/password-reset') { delivered++; return new Response('', { status: 202 }); }
      if (path.startsWith('/departments/')) {
        try { return Response.json(await departments.findOne(path.split('/').pop())); }
        catch { return new Response('', { status: 404 }); }
      }
      throw Error('Unexpected fetch');
    };
    const a = await departments.create({ name: 'Facilities', contactEmail: 'team@example.test' });
    const b = await departments.create({ name: 'IT', contactEmail: 'it@example.test' });
    const admin = await auth.createStaffOrAdmin({ email: 'admin@example.test', password, role: 'ADMIN' });
    const login = async email => (await auth.login({ email, password })).accessToken;
    const reporter = await auth.register({ email: 'reporter@example.test', password });
    const staff = await auth.createStaffOrAdmin({ email: 'individual@example.test', password, role: 'STAFF', departmentId: a.id });
    const staffToken = await login(staff.email);
    const form = { reporterId: reporter.id, reporterEmail: reporter.email, category: 'Other', location: 'Library', description: 'Broken light', photoUrls: ['/photo.png'] };

    await t.test('disable and move accounts revoke old tokens; passwords/hashes are never listed', async () => {
      assert.equal((await auth.session(staffToken)).departmentId, a.id);
      await auth.updateUser(staff.id, { departmentId: b.id }, admin.id);
      await assert.rejects(() => auth.session(staffToken), e => e.getStatus() === 401);
      const movedToken = await login(staff.email);
      assert.equal((await auth.session(movedToken)).departmentId, b.id);
      await auth.updateUser(staff.id, { active: false }, admin.id);
      await assert.rejects(() => auth.session(movedToken), e => e.getStatus() === 401);
      await assert.rejects(() => login(staff.email), e => e.getStatus() === 401);
      assert.ok((await auth.listUsers()).every(u => !('passwordHash' in u) && !('tokenVersion' in u)));
    });
    await t.test('self-disable and concurrent removal of the final admin are refused', async () => {
      await assert.rejects(() => auth.updateUser(admin.id, { active: false }, admin.id), e => e.getStatus() === 409);
      await assert.rejects(() => auth.updateUser(admin.id, { role: 'REPORTER' }, 'another-admin'), e => e.getStatus() === 409);
      const second = await auth.createStaffOrAdmin({ email: 'second-admin@example.test', password, role: 'ADMIN' });
      const results = await Promise.allSettled([auth.updateUser(admin.id, { active: false }, 'system-test'), auth.updateUser(second.id, { active: false }, 'system-test')]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await users.countBy({ role: 'ADMIN', active: true }), 1);
    });
    await t.test('recovery replies do not disclose accounts; expired/reused links fail and sessions are revoked', async () => {
      const token = await login(reporter.email);
      assert.deepEqual(await auth.forgotPassword(reporter.email), await auth.forgotPassword('unknown@example.test'));
      let mail = await db.getRepository(AuthMail).findOneByOrFail({ userId: reporter.id });
      const expired = new URL(mail.resetUrl).searchParams.get('token');
      await db.getRepository(PasswordReset).update({ userId: reporter.id }, { expiresAt: '2000-01-01T00:00:00Z' });
      await assert.rejects(() => auth.resetPassword({ token: expired, password }), e => e.getStatus() === 400);
      await auth.forgotPassword(reporter.email);
      mail = await db.getRepository(AuthMail).findOneByOrFail({ userId: reporter.id });
      const reset = new URL(mail.resetUrl).searchParams.get('token');
      const resetRow = await db.getRepository(PasswordReset).findOneByOrFail({ userId: reporter.id });
      assert.equal(resetRow.tokenHash, createHash('sha256').update(reset).digest('hex'));
      const resets = await Promise.allSettled([1, 2].map(() => auth.resetPassword({ token: reset, password })));
      assert.equal(resets.filter(r => r.status === 'fulfilled').length, 1, 'a reset link can be consumed once, including concurrent requests');
      await assert.rejects(() => auth.session(token), e => e.getStatus() === 401);
      await assert.rejects(() => auth.resetPassword({ token: reset, password }), e => e.getStatus() === 400);
    });
    await t.test('change password validates the current password and invalidates recovery links and sessions', async () => {
      const newPassword = randomBytes(24).toString('hex');
      const token = await login(reporter.email);
      await auth.forgotPassword(reporter.email);
      await assert.rejects(() => auth.changePassword(reporter.id, { currentPassword: 'wrong', password }), e => e.getStatus() === 401);
      await auth.changePassword(reporter.id, { currentPassword: password, password: newPassword });
      await assert.rejects(() => auth.session(token), e => e.getStatus() === 401);
      await assert.rejects(() => login(reporter.email), e => e.getStatus() === 401);
      assert.ok((await auth.login({ email: reporter.email, password: newPassword })).accessToken);
      assert.equal(await db.getRepository(PasswordReset).countBy({ userId: reporter.id }), 0);
    });
    await t.test('recovery mail outbox survives an outage and drains after recovery', async () => {
      await auth.forgotPassword(reporter.email);
      const worker = new AuthMailService(db);
      dependencyDown = true; await worker.tick(); dependencyDown = false;
      let mail = await db.getRepository(AuthMail).findOneByOrFail({ userId: reporter.id });
      assert.equal(mail.attempts, 1); assert.equal(delivered, 0);
      await db.getRepository(AuthMail).update({ eventId: mail.eventId }, { nextAttemptAt: '' });
      await worker.tick(); assert.equal(delivered, 1);
      assert.equal(await db.getRepository(AuthMail).count(), 0);
    });
    await t.test('concurrent identical submissions create one ticket/history/outbox/routing job; changed payload conflicts', async () => {
      const key = randomUUID(); const fingerprint = 'a'.repeat(64);
      const submissions = await Promise.all(Array.from({ length: 8 }, () => tickets.create({ ...form, submissionKey: key, submissionFingerprint: fingerprint })));
      assert.equal(new Set(submissions.map(s => s.id)).size, 1);
      const id = submissions[0].id;
      assert.equal(await db.getRepository(TicketHistory).countBy({ ticketId: id }), 1);
      assert.equal(await db.getRepository(TicketRoutingJob).countBy({ ticketId: id }), 1);
      assert.equal(await db.getRepository(OutboxEvent).createQueryBuilder('e').where("e.payload->>'ticketId' = :id", { id }).getCount(), 1);
      assert.ok(!('submissionKey' in submissions[0]) && !('submissionFingerprint' in submissions[0]));
      await assert.rejects(() => tickets.create({ ...form, submissionKey: key, submissionFingerprint: 'b'.repeat(64) }));
      await assert.rejects(() => tickets.findSubmission({ reporterId: reporter.id, submissionKey: key, submissionFingerprint: 'b'.repeat(64) }));
      const other = await tickets.create({ ...form, reporterId: randomUUID(), submissionKey: key, submissionFingerprint: fingerprint });
      assert.notEqual(other.id, id, 'keys are scoped to the reporter');
    });
    await t.test('submission transaction rolls back the key when routing insertion fails, so a retry succeeds', async () => {
      const key = randomUUID(); const reset = tickets.resetRouting;
      tickets.resetRouting = async () => { throw Error('simulated routing insertion failure'); };
      try { await assert.rejects(() => tickets.create({ ...form, submissionKey: key, submissionFingerprint: 'c'.repeat(64) })); }
      finally { tickets.resetRouting = reset; }
      assert.equal(await db.getRepository(Ticket).countBy({ submissionKey: key }), 0);
      assert.ok((await tickets.create({ ...form, submissionKey: key, submissionFingerprint: 'c'.repeat(64) })).id);
    });
    await t.test('department closure blocks staff/open work/outages and retains historical identities', async () => {
      await auth.updateUser(staff.id, { active: true, departmentId: a.id }, admin.id);
      await assert.rejects(() => departments.remove(a.id), e => e.getStatus() === 409);
      await auth.updateUser(staff.id, { active: false }, admin.id);
      const ticket = await tickets.create(form); await tickets.assign({ id: ticket.id, departmentId: a.id });
      const assignment = (await db.getRepository(OutboxEvent).find()).find(e => e.payload.ticketId === ticket.id && e.payload.status === 'ASSIGNED');
      assert.equal(assignment.payload.recipientDepartmentId, a.id);
      await assert.rejects(() => departments.remove(a.id), e => e.getStatus() === 409);
      await tickets.cancel(ticket.id);
      dependencyDown = true;
      try { await assert.rejects(() => departments.remove(a.id), e => e.getStatus() === 503); } finally { dependencyDown = false; }
      await departments.remove(a.id);
      assert.equal((await departments.findOne(a.id, true)).active, false);
      await assert.rejects(() => departments.findOne(a.id), e => e.getStatus() === 404);
      assert.equal((await tickets.getHistory(ticket.id)).ticket.departmentId, a.id);
      await assert.rejects(() => auth.updateUser(staff.id, { active: true }, admin.id), e => e.getStatus() === 400);
      await departments.update(a.id, { active: true });
      assert.equal((await departments.findOne(a.id)).active, true);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.AUTO_ROUTING_ENABLED; else process.env.AUTO_ROUTING_ENABLED = originalFlag;
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.destroy();
  }
});

test('notification audience, per-user reads and private recovery mail use real MongoDB', { skip: !mongoUrl }, async () => {
  const client = await new MongoClient(mongoUrl).connect();
  const db = client.db(`platform_test_${randomUUID().replaceAll('-', '')}`);
  try {
    const collection = db.collection('notifications');
    await collection.createIndex({ eventId: 1 }, { unique: true });
    const store = { collection: async () => collection };
    const inbox = new InboxController(store);
    const recovery = new RecoveryController(store);
    await collection.insertMany([
      { eventId: 'team-a', ticketId: 'a', recipientEmail: 'team@example.test', recipientDepartmentId: 'dept-a' },
      { eventId: 'team-b', ticketId: 'b', recipientEmail: 'other-team@example.test', recipientDepartmentId: 'dept-b' },
      { eventId: 'personal', ticketId: 'c', recipientEmail: 'worker@example.test' },
    ]);
    const query = { recipientEmail: 'worker@example.test', recipientDepartmentId: 'dept-a', viewerId: 'worker-1' };
    assert.deepEqual((await inbox.list(query)).map(n => n.eventId).sort(), ['personal', 'team-a']);
    await inbox.read('team-a', query); await inbox.read('team-a', query);
    assert.equal((await inbox.list(query)).find(n => n.eventId === 'team-a').read, true);
    assert.equal((await inbox.list({ ...query, viewerId: 'worker-2' })).find(n => n.eventId === 'team-a').read, false);
    await assert.rejects(() => inbox.read('team-b', query), e => e.getStatus() === 404);
    const mail = { eventId: randomUUID(), recipientEmail: 'worker@example.test', resetUrl: `${process.env.WEB_PUBLIC_URL ?? 'http://localhost:8080'}/reset-password?token=${'a'.repeat(64)}`, expiresAt: new Date(Date.now() + 1800000).toISOString() };
    await recovery.accept(mail); await recovery.accept(mail);
    assert.equal(await collection.countDocuments({ kind: 'PASSWORD_RESET' }), 1);
    const adminInbox = await inbox.list({ viewerId: 'admin' });
    assert.equal(adminInbox.length, 3);
    assert.ok(adminInbox.every(n => n.eventId !== mail.eventId && !('resetUrl' in n)));
    await assert.rejects(() => inbox.read(mail.eventId, { viewerId: 'admin' }), e => e.getStatus() === 404);
    assert.equal((await inbox.list(query)).length, 2);
  } finally { await db.dropDatabase(); await client.close(); }
});
