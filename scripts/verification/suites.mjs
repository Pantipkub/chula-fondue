import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { measure } from './load.mjs';

export async function seed(ctx) {
  assert.equal((await ctx.http('/tickets')).data.tickets.length, 0, 'fresh isolated dataset');
  assert.deepEqual((await ctx.http('/departments')).data, [], 'fresh Department volume');
  const department = (await ctx.http('/departments', 'POST', {
    name: `Person 3 ${ctx.runId}`, contactEmail: 'person3-department@example.com', buildings: ['P3-TEST'],
  }, 201)).data;
  const tickets = [];
  const count = ['all', 'performance'].includes(ctx.options.mode) ? 100 : 2;
  for (let i = 0; i < count; i++) {
    let ticket = await createTicket(ctx, i);
    if (i < Math.max(1, Math.floor(count / 5))) ticket = (await ctx.http(`/tickets/${ticket.id}/assign`, 'POST', { departmentId: department.id })).data;
    tickets.push(ticket);
  }
  const histories = {};
  for (const ticket of tickets) histories[ticket.id] = (await ctx.http(`/tickets/${ticket.id}/history`)).data;
  const fixture = { department, tickets, histories, benchmarkCount: count };
  ctx.save('fixtures.json', fixture);
  ctx.fixture = fixture;
  return { count, assigned: tickets.filter(t => t.status === 'ASSIGNED').length, submitted: tickets.filter(t => t.status === 'SUBMITTED').length };
}

async function createTicket(ctx, index = randomUUID()) {
  return (await ctx.http('/tickets', 'POST', {
    category: 'Verification', location: `P3-TEST-${index}`,
    description: `Isolated fixture ${ctx.runId}, item ${index}`,
    reporterEmail: `person3-${typeof index === 'number' ? index % 4 : 'functional'}@example.com`,
  }, 201)).data;
}

export async function performanceSuite(ctx) {
  const fixture = ctx.fixture;
  const list = (await ctx.http('/tickets')).data.tickets;
  assert.equal(list.length, 100, 'benchmark starts with exactly 100 visible tickets');
  assert.deepEqual(new Set(list.map(t => t.id)), new Set(fixture.tickets.map(t => t.id)));
  const expectedList = [...fixture.tickets].sort((a, b) => a.id.localeCompare(b.id));
  const results = [];
  results.push(await measure(ctx, 'tickets-list', ['/tickets'], body => {
    assert.deepEqual([...body.tickets].sort((a, b) => a.id.localeCompare(b.id)), expectedList);
  }));
  results.push(await measure(ctx, 'ticket-history', fixture.tickets.map(t => `/tickets/${t.id}/history`), (body, path) => {
    assert.deepEqual(body, fixture.histories[path.split('/')[2]]);
  }));
  ctx.performance = results;
  // Both measurements are saved even if the first endpoint misses its target.
  assert.ok(results.every(result => result.status === 'PASS'), 'one or more measured endpoint targets failed');
  return results;
}

export async function functionalSuite(ctx) {
  const department = ctx.fixture.department;
  assert.equal((await ctx.http('/departments', 'POST', { name: department.name, contactEmail: department.contactEmail }, 409)).status, 409);
  await ctx.http('/departments', 'POST', { name: 'invalid-person3', contactEmail: 'invalid' }, 400);
  await ctx.http('/tickets', 'POST', {}, 400);
  await ctx.http(`/tickets/${randomUUID()}/history`, 'GET', undefined, 404);
  const ticket = await createTicket(ctx);
  const trace = `person3-trace-${randomUUID()}`;
  await ctx.http(`/tickets/${ticket.id}/assign`, 'POST', { departmentId: department.id }, 200, trace);
  ctx.trace = trace;
  await ctx.http(`/tickets/${ticket.id}`, 'DELETE', undefined, 409);
  const expected = ['SUBMITTED', 'ASSIGNED'];
  for (const [action, body, status] of [
    ['start', {}, 'IN_PROGRESS'], ['resolve', { completionPhotoUrl: 'https://example.com/p3.jpg' }, 'RESOLVED'],
    ['reopen', { reason: 'P3 verification reopen' }, 'IN_PROGRESS'], ['resolve', {}, 'RESOLVED'], ['confirm', {}, 'CLOSED'],
  ]) {
    assert.equal((await ctx.http(`/tickets/${ticket.id}/${action}`, 'POST', body)).data.status, status);
    expected.push(status);
  }
  const history = (await ctx.http(`/tickets/${ticket.id}/history`)).data;
  assert.deepEqual(history.history.map(h => h.toStatus), expected);
  assert.equal(history.ticket.status, 'CLOSED');
  const beforeInvalid = history;
  await ctx.http(`/tickets/${ticket.id}/start`, 'POST', {}, 409);
  assert.deepEqual((await ctx.http(`/tickets/${ticket.id}/history`)).data, beforeInvalid);
  const cancelled = await createTicket(ctx);
  assert.equal((await ctx.http(`/tickets/${cancelled.id}`, 'DELETE')).data.status, 'CANCELLED');
  const rejected = await createTicket(ctx);
  assert.equal((await ctx.http(`/tickets/${rejected.id}/reject`, 'POST', { reason: 'P3 test' })).data.status, 'REJECTED');
  const untouched = await createTicket(ctx);
  const snapshot = (await ctx.http(`/tickets/${untouched.id}/history`)).data;
  await ctx.http(`/tickets/${untouched.id}/assign`, 'POST', { departmentId: randomUUID() }, 404);
  assert.deepEqual((await ctx.http(`/tickets/${untouched.id}/history`)).data, snapshot);
  const all = (await ctx.http('/tickets?includeCancelled=true')).data.tickets;
  const visible = (await ctx.http('/tickets')).data.tickets;
  assert.equal(all.length, ctx.fixture.benchmarkCount + 4);
  assert.deepEqual(new Set(visible.map(t => t.id)), new Set(all.filter(t => t.status !== 'CANCELLED').map(t => t.id)));
  for (const query of [
    { status: 'CLOSED' }, { status: 'SUBMITTED' }, { departmentId: department.id },
    { reporterEmail: 'person3-functional@example.com' },
    { status: 'CLOSED', departmentId: department.id, reporterEmail: 'person3-functional@example.com' },
  ]) {
    const got = (await ctx.http(`/tickets?${new URLSearchParams(query)}`)).data.tickets;
    const matching = visible.filter(t => Object.entries(query).every(([key, value]) => t[key] === value));
    assert.deepEqual(new Set(got.map(t => t.id)), new Set(matching.map(t => t.id)));
  }
  await Promise.all(Array.from({ length: 8 }, (_, i) => ctx.http('/health', 'GET', undefined, 200, `p3-parallel-${i}`)));
  const result = { lifecycleTicketId: ticket.id, historyStates: expected, cancelledId: cancelled.id, rejectedId: rejected.id, unchangedId: untouched.id, trace, filters: 5, visibleTicketsAfter: visible.length, totalTicketsAfter: all.length };
  ctx.save('functional.json', result);
  return result;
}

async function dns(ctx) {
  const text = await ctx.compose(['exec', '-T', 'api-gateway', 'node', '--input-type=module', '-e',
    'import {lookup} from "node:dns/promises"; const result={endpoints:{department:process.env.DEPARTMENT_SERVICE_URL,ticket:process.env.TICKET_SERVICE_URL},dns:{}}; for(const name of ["department-service","ticket-service"]) result.dns[name]=await lookup(name,{all:true}); console.log(JSON.stringify(result));']);
  const result = JSON.parse(text.trim());
  assert.equal(result.endpoints.department, 'http://department-service:3001');
  assert.equal(result.endpoints.ticket, 'ticket-service:50051');
  for (const addresses of Object.values(result.dns)) assert.ok(addresses.length > 0);
  return result;
}

export async function discoverySuite(ctx) {
  const department = ctx.fixture.department;
  const ticket = ctx.fixture.tickets.find(t => t.status === 'ASSIGNED') ?? ctx.fixture.tickets[0];
  const before = { department: (await ctx.http(`/departments/${department.id}`)).data, history: (await ctx.http(`/tickets/${ticket.id}/history`)).data };
  const gateway = (await ctx.compose(['ps', '-q', 'api-gateway'])).trim();
  const results = { before, dnsBefore: await dns(ctx), gatewayBefore: gateway, recreations: [] };
  for (const service of ['department-service', 'ticket-service']) {
    const idBefore = (await ctx.compose(['ps', '-q', service])).trim();
    await ctx.compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120', service]);
    await ctx.waitReady();
    const idAfter = (await ctx.compose(['ps', '-q', service])).trim();
    assert.notEqual(idAfter, idBefore, 'container actually replaced');
    assert.equal((await ctx.compose(['ps', '-q', 'api-gateway'])).trim(), gateway, 'original Gateway process retained');
    assert.deepEqual((await ctx.http(`/departments/${department.id}`)).data, before.department);
    assert.deepEqual((await ctx.http(`/tickets/${ticket.id}/history`)).data, before.history);
    results.recreations.push({ service, idBefore, idAfter, dnsAfter: await dns(ctx), recordsAndHistory: 'unchanged' });
  }
  for (const service of ['api-gateway', 'department-service', 'ticket-service']) {
    await ctx.compose(['exec', '-T', service, 'node', '/app/docker/healthcheck.mjs', service]);
  }
  ctx.save('discovery.json', results);
  return results;
}

export async function failureSuite(ctx) {
  const ticket = ctx.fixture.tickets.find(t => t.status === 'SUBMITTED');
  const before = (await ctx.http(`/tickets/${ticket.id}/history`)).data;
  const phases = [
    ['department-service', false], ['department-service', true], ['ticket-service', false], ['ticket-service', true],
  ];
  const results = phases.map(([service, slow]) => ({ phase: `${service}-${slow ? 'slow' : 'stopped'}`, status: 'NOT_RUN' }));
  const persist = () => ctx.save('failure.json', { ticketId: ticket.id, before, phases: results });
  persist();
  for (const [index, [service, slow]] of phases.entries()) {
    const detail = results[index];
    console.log(`[fault] ${detail.phase}`);
    const container = (await ctx.compose(['ps', '-q', service])).trim();
    try {
      // A frozen container simulates an unresponsive dependency, rather than network latency.
      if (slow) await ctx.docker(['pause', container]);
      else await ctx.compose(['stop', service]);
      const ready = await ctx.http('/ready', 'GET', undefined, 503);
      const dependency = service === 'department-service' ? 'department' : 'ticket';
      assert.equal(ready.data.dependencies[dependency].status, 'down');
      assert.equal(ready.data.dependencies[dependency === 'department' ? 'ticket' : 'department'].status, 'up');
      assert.ok(ready.durationMs < 1800);
      await ctx.http('/health');
      await ctx.http(dependency === 'department' ? '/tickets' : '/departments');
      const expectedStatus = slow ? 504 : 503;
      const response = await ctx.http(dependency === 'department' ? '/departments' : '/tickets', 'GET', undefined, null);
      Object.assign(detail, { readinessStatus: ready.status, readinessMs: ready.durationMs, expectedHttpStatus: expectedStatus, httpStatus: response.status, durationMs: response.durationMs });
      assert.equal(response.status, expectedStatus, `${detail.phase}: expected HTTP ${expectedStatus}, observed ${response.status} in ${response.durationMs.toFixed(1)}ms`);
      assert.ok(response.durationMs < (dependency === 'department' ? 3200 : 4200));
      if (slow) assert.ok(response.durationMs >= (dependency === 'department' ? 1700 : 2600));
      if (dependency === 'department') {
        const assign = await ctx.http(`/tickets/${ticket.id}/assign`, 'POST', { departmentId: ctx.fixture.department.id }, null);
        Object.assign(detail, { assignmentStatus: assign.status, assignmentMs: assign.durationMs });
        assert.equal(assign.status, expectedStatus);
        assert.ok(assign.durationMs < 3200);
        if (slow) assert.ok(assign.durationMs >= 1700);
        assert.deepEqual((await ctx.http(`/tickets/${ticket.id}/history`)).data, before);
        detail.ticketAndHistory = 'unchanged';
      }
      detail.status = 'PASS';
    } catch (error) {
      detail.status = 'FAIL'; detail.error = error.message;
    } finally {
      try {
        if (slow) await ctx.docker(['unpause', container]);
        else await ctx.docker(['start', container]);
        await ctx.waitReady();
        assert.deepEqual((await ctx.http(`/tickets/${ticket.id}/history`)).data, before, 'no late mutation after restoration');
        detail.restored = true;
      } catch (error) {
        Object.assign(detail, { restored: false, status: 'FAIL', restorationError: error.message });
        persist();
        throw error; // Do not inject another fault into a system that has not recovered.
      }
      persist();
    }
  }
  assert.ok(results.every(phase => phase.status === 'PASS'), 'one or more dependency fault checks failed; see failure.json');
  return results;
}
