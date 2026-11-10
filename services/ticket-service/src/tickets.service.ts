import { randomUUID } from 'node:crypto';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { OutboxEvent } from './outbox.entity.js';
import { currentExpectedVersion, currentRequestId } from './request-context.js';
import { Ticket, TicketHistory } from './ticket.entity.js';
import { autoRoutingEnabled, TicketRoutingJob } from './ticket-routing-job.entity.js';
import type { RoutingClaim, RoutingMatch } from './auto-routing.service.js';

// In Docker Compose this is http://department-service:3001: a name that Docker DNS resolves.
const DEPARTMENT_SERVICE_URL = process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001';
/** How long an assignment waits for Department Service before failing with DEADLINE_EXCEEDED. */
const DEPARTMENT_TIMEOUT_MS = Number(process.env.DEPARTMENT_TIMEOUT_MS ?? 3000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rpcError = (code: GrpcStatus, message: string) => new RpcException({ code, message });

function requireFields(req: object, ...fields: string[]) {
  for (const field of fields) {
    const value = (req as Record<string, unknown>)[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 5000) {
      throw rpcError(GrpcStatus.INVALID_ARGUMENT, `${field} is required`);
    }
  }
}

function requirePhotos(field: string, urls: string[] | undefined) {
  if (!urls?.length || urls.length > 5 || urls.some((url) => typeof url !== 'string' || !url.trim())) {
    throw rpcError(GrpcStatus.INVALID_ARGUMENT, `${field} needs at least one photo`);
  }
  return urls;
}

@Injectable()
export class TicketsService implements OnModuleInit {
  private readonly logger = new Logger('TicketService');

  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(TicketHistory) private readonly history: Repository<TicketHistory>,
    @Inject('NOTIFICATION_BROKER') private readonly broker: ClientProxy,
  ) {}

  // Connect to RabbitMQ at startup instead of on the first event, so /health/ready can report the broker.
  // The client reconnects by itself (amqp-connection-manager) if the broker restarts later.
  onModuleInit() {
    this.broker.connect().catch((error) => this.logger.warn(`RabbitMQ not reachable yet, will retry: ${error}`));
  }

  async findSubmission(req: { reporterId: string; submissionKey: string; submissionFingerprint: string }) {
    const ticket = await this.tickets.findOneBy({ reporterId: req.reporterId, submissionKey: req.submissionKey });
    if (!ticket) return {};
    if (ticket.submissionFingerprint !== req.submissionFingerprint) throw rpcError(GrpcStatus.ABORTED, 'Submission key was already used with different content');
    return { ticket: (await this.present([ticket]))[0] };
  }

  async create(req: Pick<Ticket, 'category' | 'location' | 'description' | 'photoUrls' | 'reporterEmail'> & { reporterId?: string; submissionKey?: string; submissionFingerprint?: string }) {
    requireFields(req, 'category', 'location', 'description', 'reporterEmail');
    const ticket = this.tickets.create({
      category: req.category,
      location: req.location,
      description: req.description,
      photoUrls: requirePhotos('photoUrls', req.photoUrls),
      completionPhotoUrls: [],
      reporterEmail: req.reporterEmail,
      reporterId: req.reporterId ?? '',
      submissionKey: req.submissionKey ?? '',
      submissionFingerprint: req.submissionFingerprint ?? '',
    });
    if (req.submissionKey) {
      if (!UUID.test(req.submissionKey) || !req.reporterId || !/^[a-f0-9]{64}$/.test(req.submissionFingerprint ?? '')) {
        throw rpcError(GrpcStatus.INVALID_ARGUMENT, 'Invalid submission key or fingerprint');
      }
      // Serialize identical submissions across workers, in the same transaction as the ticket/event.
      const saved = await this.tickets.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`submission:${req.reporterId}:${req.submissionKey}`]);
        const existing = await manager.findOneBy(Ticket, { reporterId: req.reporterId, submissionKey: req.submissionKey });
        if (existing) {
          if (existing.submissionFingerprint !== req.submissionFingerprint) throw rpcError(GrpcStatus.ABORTED, 'Submission key was already used with different content');
          return existing;
        }
        const result = await this.writeTransition(manager, ticket, 'SUBMITTED', 'Ticket created', []);
        if (autoRoutingEnabled()) await this.resetRouting(manager, result.id);
        return result;
      });
      return (await this.present([saved]))[0];
    }
    return this.setStatus(ticket, 'SUBMITTED', 'Ticket created', undefined, async (manager, saved) => {
      if (autoRoutingEnabled()) await this.resetRouting(manager, saved.id);
    });
  }

  async list(req: { status?: string; departmentId?: string; reporterEmail?: string; reporterId?: string; includeCancelled?: boolean }) {
    const filters = {
      ...(req.status && { status: req.status }),
      ...(req.departmentId && { departmentId: req.departmentId }),
    };
    const tickets = await this.tickets.find({
      where: req.reporterId ? [
        { ...filters, reporterId: req.reporterId },
        { ...filters, reporterId: '', reporterEmail: req.reporterEmail ?? '__none__' },
      ] : { ...filters, ...(req.reporterEmail && { reporterEmail: req.reporterEmail }) },
      order: { createdAt: 'DESC' },
    });
    return { tickets: await this.present(req.includeCancelled ? tickets : tickets.filter((t) => t.status !== 'CANCELLED')) };
  }

  async getHistory(id: string) {
    const ticket = await this.load(id);
    const history = await this.history.find({ where: { ticketId: ticket.id }, order: { id: 'ASC' } });
    return { ticket: (await this.present([ticket]))[0], history };
  }

  async recategorize(req: { id: string; category: string }) {
    requireFields(req, 'category');
    const ticket = await this.load(req.id, 'SUBMITTED', 'ASSIGNED');
    ticket.category = req.category.trim();
    return this.setStatus(ticket, ticket.status, `Category changed to ${ticket.category}`, undefined, async (manager) => {
      if (ticket.status === 'SUBMITTED') {
        if (autoRoutingEnabled()) await this.resetRouting(manager, ticket.id);
        else await this.stopRouting(manager, ticket.id, 'STOPPED', 'AUTO_ROUTING_DISABLED');
      }
    });
  }

  async assign(req: { id: string; departmentId: string }) {
    const ticket = await this.load(req.id, 'SUBMITTED', 'ASSIGNED');
    requireFields(req, 'departmentId');
    const department = await this.fetchDepartment(req.departmentId);
    ticket.departmentId = department.id;
    ticket.departmentName = department.name;
    ticket.departmentContactEmail = department.contactEmail;
    ticket.assignmentSource = 'ADMIN'; ticket.routingRuleId = '';
    return this.setStatus(ticket, 'ASSIGNED', `Assigned to ${department.name}`, department.contactEmail,
      (manager) => this.stopRouting(manager, ticket.id, 'DONE'));
  }

  async cancel(id: string) {
    const ticket = await this.load(id, 'SUBMITTED', 'ASSIGNED');
    return this.setStatus(ticket, 'CANCELLED', 'Cancelled by reporter', ticket.departmentContactEmail,
      (manager) => this.stopRouting(manager, ticket.id, 'STOPPED'));
  }

  async reject(req: { id: string; reason: string }) {
    const ticket = await this.load(req.id, 'SUBMITTED', 'ASSIGNED');
    requireFields(req, 'reason');
    ticket.reason = req.reason;
    return this.setStatus(ticket, 'REJECTED', req.reason, [ticket.reporterEmail, ticket.departmentContactEmail],
      (manager) => this.stopRouting(manager, ticket.id, 'STOPPED'));
  }

  async startProgress(id: string) {
    const ticket = await this.load(id, 'ASSIGNED');
    return this.setStatus(ticket, 'IN_PROGRESS', 'Work started', ticket.reporterEmail);
  }

  async resolve(req: { id: string; completionPhotoUrls?: string[] }) {
    const ticket = await this.load(req.id, 'IN_PROGRESS');
    ticket.completionPhotoUrls = requirePhotos('completionPhotoUrls', req.completionPhotoUrls);
    const note = `Resolved with ${ticket.completionPhotoUrls.length} completion photo(s)`;
    return this.setStatus(ticket, 'RESOLVED', note, ticket.reporterEmail);
  }

  async confirmResolution(id: string) {
    const ticket = await this.load(id, 'RESOLVED');
    return this.setStatus(ticket, 'CLOSED', 'Resolution confirmed by reporter', ticket.reporterEmail);
  }

  async reopen(req: { id: string; reason: string }) {
    const ticket = await this.load(req.id, 'RESOLVED');
    requireFields(req, 'reason');
    const department = await this.fetchDepartment(ticket.departmentId);
    ticket.reason = req.reason;
    ticket.resolvedAt = '';
    return this.setStatus(ticket, 'IN_PROGRESS', req.reason, department.contactEmail);
  }

  private async load(id: string, ...allowedStatuses: string[]) {
    requireFields({ id }, 'id');
    // Postgres rejects a malformed uuid with an error, so treat it as "no such ticket" here.
    const ticket = UUID.test(id) ? await this.tickets.findOneBy({ id }) : null;
    if (!ticket) throw rpcError(GrpcStatus.NOT_FOUND, `Ticket ${id} not found`);
    if (allowedStatuses.length && !allowedStatuses.includes(ticket.status)) {
      throw rpcError(
        GrpcStatus.FAILED_PRECONDITION,
        `Ticket is ${ticket.status}; this action requires ${allowedStatuses.join(' or ')}`,
      );
    }
    return ticket;
  }

  async closeExpiredResolutions() {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const expired = await this.tickets.find({ where: { status: 'RESOLVED', updatedAt: LessThan(cutoff) }, take: 50 });
    for (const ticket of expired) {
      try { await this.setStatus(ticket, 'CLOSED', 'Automatically closed after 7 days', ticket.reporterEmail); }
      catch (error) { if (!(error instanceof RpcException)) throw error; }
    }
  }

  async retryRouting(id: string) {
    if (!autoRoutingEnabled()) throw rpcError(GrpcStatus.FAILED_PRECONDITION, 'Automatic routing is disabled');
    const ticket = await this.load(id, 'SUBMITTED');
    return this.setStatus(ticket, 'SUBMITTED', 'Automatic routing requested by admin', undefined,
      (manager) => this.resetRouting(manager, ticket.id));
  }

  // Every writer locks ticket before routing job. The lease and version fence delayed HTTP responses.
  async finishRouting(claim: RoutingClaim, result: RoutingMatch | string, retryAfterMs?: number) {
    await this.tickets.manager.transaction(async (manager) => {
      const ticket = await manager.findOne(Ticket, { where: { id: claim.ticket.id }, lock: { mode: 'pessimistic_write' } });
      const job = await manager.findOne(TicketRoutingJob, { where: { ticketId: claim.ticket.id }, lock: { mode: 'pessimistic_write' } });
      if (!ticket || !job || ticket.status !== 'SUBMITTED' || ticket.version !== claim.ticket.version ||
          ticket.category !== claim.ticket.category || job.state !== 'PROCESSING' || job.leaseToken !== claim.token ||
          job.leaseUntil <= new Date().toISOString()) {
        throw rpcError(GrpcStatus.ABORTED, 'Routing result is stale');
      }
      job.leaseToken = ''; job.leaseUntil = ''; job.updatedAt = new Date().toISOString();
      if (typeof result !== 'string' && result.result === 'MATCHED') {
        ticket.departmentId = result.department.id; ticket.departmentName = result.department.name;
        ticket.departmentContactEmail = result.department.contactEmail;
        ticket.assignmentSource = 'AUTO'; ticket.routingRuleId = result.ruleId;
        await this.writeTransition(manager, ticket, 'ASSIGNED', `Automatically assigned to ${result.department.name} (category: ${result.category}; rule: ${result.ruleId})`,
          [result.department.contactEmail], claim.requestId);
        job.state = 'DONE'; job.lastReason = '';
      } else {
        const reason = typeof result === 'string' ? result : result.result;
        job.lastReason = reason;
        if (retryAfterMs !== undefined) {
          job.state = 'RETRY'; job.nextAttemptAt = new Date(Date.now() + retryAfterMs).toISOString();
        } else {
          job.state = 'REVIEW';
          await this.writeTransition(manager, ticket, 'SUBMITTED', `Automatic routing needs review: ${reason}`, [], claim.requestId);
        }
      }
      await manager.save(job);
    });
  }

  private async resetRouting(manager: EntityManager, ticketId: string) {
    const now = new Date().toISOString();
    const job = await manager.findOneBy(TicketRoutingJob, { ticketId });
    await manager.save(TicketRoutingJob, { ticketId, createdAt: job?.createdAt ?? now, updatedAt: now,
      state: 'PENDING', attempts: 0, nextAttemptAt: now, lastReason: '', leaseToken: '', leaseUntil: '', requestId: currentRequestId() });
  }

  private async stopRouting(manager: EntityManager, ticketId: string, state: 'DONE' | 'STOPPED', lastReason = '') {
    await manager.update(TicketRoutingJob, { ticketId }, { state, lastReason, leaseToken: '', leaseUntil: '', updatedAt: new Date().toISOString() });
  }

  private async present(tickets: Ticket[]) {
    if (!tickets.length) return [];
    const jobs = await this.tickets.manager.find(TicketRoutingJob, { where: { ticketId: In(tickets.map((ticket) => ticket.id)) } });
    const byId = new Map(jobs.map((job) => [job.ticketId, job]));
    return tickets.map(({ departmentContactEmail: _internal, submissionKey: _key, submissionFingerprint: _fingerprint, ...ticket }) => {
      const job = byId.get(ticket.id);
      return { ...ticket, routingStatus: job?.state === 'PROCESSING' ? 'PENDING' : job?.state ?? 'NONE', routingReason: job?.lastReason ?? '' };
    });
  }

  private async setStatus(ticket: Ticket, toStatus: string, note: string, notifyEmail?: string | string[],
    after?: (manager: EntityManager, saved: Ticket) => Promise<unknown>) {
    const saved = await this.tickets.manager.transaction(async (manager) => {
      const result = await this.writeTransition(manager, ticket, toStatus, note, [notifyEmail ?? ''].flat());
      await after?.(manager, result);
      return result;
    });
    return (await this.present([saved]))[0];
  }

  private async writeTransition(manager: EntityManager, ticket: Ticket, toStatus: string, note: string, notifyEmails: string[], requestId = currentRequestId()) {
    const now = new Date().toISOString();
    const fromStatus = ticket.status ?? '';
    if (ticket.id) {
      const current = await manager.findOne(Ticket, { where: { id: ticket.id }, lock: { mode: 'pessimistic_write' } });
      const expectedVersion = currentExpectedVersion();
      if (!current || current.version !== ticket.version || current.status !== fromStatus ||
          (expectedVersion !== undefined && expectedVersion !== current.version)) {
        throw rpcError(GrpcStatus.ABORTED, 'Ticket changed concurrently; reload and retry');
      }
    }
    ticket.status = toStatus;
    ticket.version = (ticket.version ?? 0) + 1;
    ticket.createdAt ??= now;
    ticket.updatedAt = now;
    if (toStatus === 'RESOLVED') ticket.resolvedAt = now;
    if (toStatus === 'CLOSED') ticket.closedAt = now;
    const saved = await manager.save(ticket);
    await manager.save(TicketHistory, { ticketId: saved.id, fromStatus, toStatus, note, changedAt: now });
    // Ticket, history and outbox commit together; no broker call is made in the business transaction.
    const recipients = [...new Set(notifyEmails.filter(Boolean))];
    const { departmentContactEmail: _internal, submissionKey: _key, submissionFingerprint: _fingerprint, ...publicTicket } = saved;
    for (const [index, recipientEmail] of (recipients.length ? recipients : ['']).entries()) {
      const eventId = randomUUID();
      await manager.save(OutboxEvent, {
        id: eventId, createdAt: now, notificationSent: !recipientEmail, analyticsSent: index !== 0,
        payload: { ...publicTicket, eventId, requestId, ticketId: saved.id, recipientEmail,
          recipientDepartmentId: recipientEmail && recipientEmail === saved.departmentContactEmail ? saved.departmentId : '',
          changedAt: now, note, fromStatus },
      });
    }
    return saved;
  }

  private async fetchDepartment(departmentId: string): Promise<{ id: string; name: string; contactEmail: string }> {
    const url = `${DEPARTMENT_SERVICE_URL}/departments/${encodeURIComponent(departmentId)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'X-Request-Id': currentRequestId() },
        signal: AbortSignal.timeout(DEPARTMENT_TIMEOUT_MS),
      });
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') {
        this.logger.error(`GET ${url} -> no answer within ${DEPARTMENT_TIMEOUT_MS} ms`);
        throw rpcError(GrpcStatus.DEADLINE_EXCEEDED, `Department Service did not answer within ${DEPARTMENT_TIMEOUT_MS} ms`);
      }
      this.logger.error(`GET ${url} -> unreachable`);
      throw rpcError(GrpcStatus.UNAVAILABLE, 'Department Service unreachable');
    }
    this.logger.log(`GET ${url} -> ${response.status}`);
    // 400 is Department Service refusing an id that is not a uuid, which also means "no such department".
    if (response.status === 404 || response.status === 400) {
      throw rpcError(GrpcStatus.NOT_FOUND, `Department ${departmentId} not found`);
    }
    if (!response.ok) throw rpcError(GrpcStatus.UNAVAILABLE, `Department Service returned ${response.status}`);
    return (await response.json()) as { id: string; name: string; contactEmail: string };
  }
}
