import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Ticket, TicketHistory } from '../services/ticket-service/dist/ticket.entity.js';
import { TicketRoutingJob } from '../services/ticket-service/dist/ticket-routing-job.entity.js';
import { OutboxEvent } from '../services/ticket-service/dist/outbox.entity.js';
import { TicketsService } from '../services/ticket-service/dist/tickets.service.js';
import { AutoRoutingService } from '../services/ticket-service/dist/auto-routing.service.js';
import { Department } from '../services/department-service/dist/department.entity.js';
import { RoutingRule } from '../services/department-service/dist/routing-rule.entity.js';
import { RoutingRulesService } from '../services/department-service/dist/routing-rules.service.js';
import { DepartmentsService } from '../services/department-service/dist/departments.service.js';

// Opt-in: every run uses a new schema and removes only that schema, never application tables.
test('automatic routing: PostgreSQL transactions, leases and lifecycle', { skip: !process.env.ROUTING_TEST_DATABASE_URL }, async (t) => {
  const schema = `routing_test_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({ type: 'postgres', url: process.env.ROUTING_TEST_DATABASE_URL, schema,
    entities: [Ticket, TicketHistory, TicketRoutingJob, OutboxEvent, Department, RoutingRule] });
  const previousFlag = process.env.AUTO_ROUTING_ENABLED;
  const originalFetch = globalThis.fetch;
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    process.env.AUTO_ROUTING_ENABLED = 'true';
    const tickets = new TicketsService(db.getRepository(Ticket), db.getRepository(TicketHistory), { connect: async () => {} });
    const rules = new RoutingRulesService(db.getRepository(RoutingRule));
    const departments = new DepartmentsService(db.getRepository(Department));
    const worker = new AutoRoutingService(db, tickets);
    const otherWorker = new AutoRoutingService(db, tickets);
    const department = await departments.create({ name: 'IT', contactEmail: 'it@example.test', buildings: [] });
    const other = await departments.create({ name: 'Facilities', contactEmail: 'facilities@example.test', buildings: [] });
    const rule = await rules.create({ category: ' it / NETWORK ', departmentId: department.id, enabled: true });
    const make = (category = 'IT / Network') => tickets.create({ category, location: 'A', description: 'Issue', reporterEmail: 'reporter@example.test', photoUrls: ['/photo.png'] });
    const get = async (id) => (await tickets.getHistory(id)).ticket;
    const outbox = (id) => db.getRepository(OutboxEvent).createQueryBuilder('e').where("e.payload->>'ticketId' = :id", { id }).getMany();
    const match = () => rules.match('IT / Network');
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/department-usage/')) return Response.json({ staff: 0, total: 0 });
      if (String(url).endsWith('/usage')) return Response.json({ open: 0 });
      if (String(url).includes('/routing-rules/match')) return Response.json(await rules.match(JSON.parse(init.body).category));
      const id = decodeURIComponent(String(url).split('/').pop());
      return Response.json(await departments.findOne(id));
    };
    const matchResult = await match();

    await t.test('canonical category, unique active rule and deletion protection', async () => {
      assert.equal(rule.category, 'IT / Network');
      const result = await Promise.allSettled([1, 2].map(() => rules.create({ category: 'Electrical', departmentId: other.id })));
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(result.find(r => r.status === 'rejected').reason.getStatus(), 409);
      await assert.rejects(() => departments.remove(department.id), error => error.getStatus() === 409);
      await assert.rejects(() => rules.create({ category: 'Other', departmentId: department.id }), error => error.getStatus() === 400);
    });
    await t.test('create, routing job and outbox roll back together', async () => {
      const count = await db.getRepository(Ticket).count();
      const reset = tickets.resetRouting;
      tickets.resetRouting = async () => { throw Error('simulated job insertion failure'); };
      try { await assert.rejects(make, /simulated/); } finally { tickets.resetRouting = reset; }
      assert.equal(await db.getRepository(Ticket).count(), count);
    });
    await t.test('worker assigns and records exactly one assignment, with private email omitted', async () => {
      const ticket = await make();
      assert.equal(ticket.routingStatus, 'PENDING');
      await worker.tick();
      const result = await tickets.getHistory(ticket.id);
      assert.equal(result.ticket.status, 'ASSIGNED');
      assert.equal(result.ticket.assignmentSource, 'AUTO');
      assert.equal(result.ticket.departmentId, department.id);
      assert.equal(result.ticket.routingRuleId, rule.id);
      assert.equal(result.ticket.routingStatus, 'DONE');
      assert.ok(!('departmentContactEmail' in result.ticket));
      assert.equal(result.history.filter(h => h.toStatus === 'ASSIGNED').length, 1);
      await worker.tick();
      const events = await outbox(ticket.id);
      assert.equal(events.filter(e => e.payload.status === 'ASSIGNED').length, 1);
      assert.equal(events.find(e => e.payload.status === 'ASSIGNED').payload.recipientEmail, department.contactEmail);
    });
    await t.test('no rule enters review once and explicit retry picks up a new rule', async () => {
      const ticket = await make('Building');
      await worker.tick();
      assert.equal((await get(ticket.id)).routingReason, 'NO_RULE');
      const count = (await tickets.getHistory(ticket.id)).history.length;
      await worker.tick();
      assert.equal((await tickets.getHistory(ticket.id)).history.length, count);
      await rules.create({ category: 'Building', departmentId: other.id });
      await tickets.retryRouting(ticket.id);
      await worker.tick();
      assert.equal((await get(ticket.id)).departmentId, other.id);
    });
    await t.test('transient outage persists retry and another worker resumes it', async () => {
      const ticket = await make();
      const fetch = globalThis.fetch;
      globalThis.fetch = async () => { throw Error('offline'); };
      try { await worker.tick(); } finally { globalThis.fetch = fetch; }
      assert.equal((await get(ticket.id)).routingStatus, 'RETRY');
      assert.equal((await db.getRepository(TicketRoutingJob).findOneByOrFail({ ticketId: ticket.id })).attempts, 1);
      await db.getRepository(TicketRoutingJob).update({ ticketId: ticket.id }, { nextAttemptAt: '' });
      await otherWorker.tick();
      assert.equal((await get(ticket.id)).status, 'ASSIGNED');
    });
    await t.test('five failed attempts stop and enter admin review', async () => {
      const ticket = await make();
      const fetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('', { status: 503 });
      try {
        for (let i = 0; i < 5; i++) {
          await db.getRepository(TicketRoutingJob).update({ ticketId: ticket.id }, { nextAttemptAt: '' });
          await worker.tick();
        }
      } finally { globalThis.fetch = fetch; }
      assert.equal((await get(ticket.id)).routingReason, 'RETRIES_EXHAUSTED');
      assert.equal((await get(ticket.id)).routingStatus, 'REVIEW');
      assert.equal((await db.getRepository(TicketRoutingJob).findOneByOrFail({ ticketId: ticket.id })).attempts, 5);
    });
    await t.test('ambiguous or invalid rule responses go to review without retries', async () => {
      const fetch = globalThis.fetch;
      try {
        for (const [body, reason] of [[{ result: 'AMBIGUOUS_RULES' }, 'AMBIGUOUS_RULES'], [{ result: 'MATCHED', department: null }, 'INVALID_RULE']]) {
          const ticket = await make();
          globalThis.fetch = async () => Response.json(body);
          await worker.tick();
          assert.equal((await get(ticket.id)).routingStatus, 'REVIEW');
          assert.equal((await get(ticket.id)).routingReason, reason);
        }
      } finally { globalThis.fetch = fetch; }
    });
    await t.test('two workers cannot claim the same job and an expired lease is fenced', async () => {
      const ticket = await make();
      const claims = (await Promise.all([worker.claim(), otherWorker.claim()])).filter(Boolean);
      assert.equal(claims.length, 1);
      const first = claims[0];
      await db.getRepository(TicketRoutingJob).update({ ticketId: ticket.id }, { leaseUntil: '' });
      const second = await otherWorker.claim();
      assert.ok(second); assert.notEqual(first.token, second.token);
      await assert.rejects(() => tickets.finishRouting(first, matchResult));
      await tickets.finishRouting(second, await match());
      assert.equal((await get(ticket.id)).status, 'ASSIGNED');
      const events = await outbox(ticket.id);
      assert.equal(events.filter(e => e.payload.status === 'ASSIGNED').length, 1);
    });
    await t.test('manual assignment invalidates an in-flight automatic result', async () => {
      const ticket = await make(); const claim = await worker.claim();
      await tickets.assign({ id: ticket.id, departmentId: other.id });
      await assert.rejects(() => tickets.finishRouting(claim, matchResult));
      const saved = await get(ticket.id);
      assert.equal(saved.departmentId, other.id); assert.equal(saved.assignmentSource, 'ADMIN');
    });
    await t.test('recategorization invalidates the old result and requeues the new category', async () => {
      const ticket = await make(); const claim = await worker.claim();
      await tickets.recategorize({ id: ticket.id, category: 'Building' });
      await assert.rejects(() => tickets.finishRouting(claim, matchResult));
      await worker.tick(); assert.equal((await get(ticket.id)).departmentId, other.id);
    });
    await t.test('cancel stops in-flight routing', async () => {
      const ticket = await make(); const claim = await worker.claim();
      await tickets.cancel(ticket.id);
      await assert.rejects(() => tickets.finishRouting(claim, matchResult));
      assert.equal((await get(ticket.id)).status, 'CANCELLED');
      assert.equal((await get(ticket.id)).routingStatus, 'STOPPED');
    });
    await t.test('reject assigned ticket notifies both recipients but projects analytics once', async () => {
      const ticket = await make(); await worker.tick();
      await tickets.reject({ id: ticket.id, reason: 'Duplicate' });
      const events = (await outbox(ticket.id)).filter(e => e.payload.status === 'REJECTED');
      assert.equal(events.length, 2);
      assert.equal(new Set(events.map(e => e.id)).size, 2);
      assert.equal(events.filter(e => !e.analyticsSent).length, 1);
      assert.deepEqual(events.map(e => e.payload.recipientEmail).sort(), ['it@example.test', 'reporter@example.test']);
    });
    await t.test('start and cancel compete: one commits and terminal work cannot restart', async () => {
      const ticket = await make(); await worker.tick();
      const actions = await Promise.allSettled([tickets.startProgress(ticket.id), tickets.cancel(ticket.id)]);
      assert.equal(actions.filter(r => r.status === 'fulfilled').length, 1);
      const saved = await get(ticket.id);
      if (saved.status === 'IN_PROGRESS') await assert.rejects(() => tickets.cancel(ticket.id));
      else await assert.rejects(() => tickets.startProgress(ticket.id));
    });
    await t.test('disabled feature creates no job, leaves legacy/manual behavior available', async () => {
      process.env.AUTO_ROUTING_ENABLED = 'false';
      const ticket = await make();
      assert.equal(ticket.routingStatus, 'NONE');
      assert.equal(await db.getRepository(TicketRoutingJob).countBy({ ticketId: ticket.id }), 0);
      await worker.tick(); assert.equal((await get(ticket.id)).status, 'SUBMITTED');
      await assert.rejects(() => tickets.retryRouting(ticket.id));
      await tickets.assign({ id: ticket.id, departmentId: department.id });
      assert.equal((await get(ticket.id)).assignmentSource, 'ADMIN');
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousFlag === undefined) delete process.env.AUTO_ROUTING_ENABLED; else process.env.AUTO_ROUTING_ENABLED = previousFlag;
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
});
