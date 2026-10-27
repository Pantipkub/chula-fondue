import { randomUUID } from 'node:crypto';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder, RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { currentRequestId } from './request-context.js';
import { Ticket, TicketHistory } from './ticket.entity.js';

// In Docker Compose this is http://department-service:3001: a name that Docker DNS resolves.
const DEPARTMENT_SERVICE_URL = process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001';
/** How long an assignment waits for Department Service before failing with DEADLINE_EXCEEDED. */
const DEPARTMENT_TIMEOUT_MS = Number(process.env.DEPARTMENT_TIMEOUT_MS ?? 3000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rpcError = (code: GrpcStatus, message: string) => new RpcException({ code, message });

function requireFields(req: object, ...fields: string[]) {
  for (const field of fields) {
    const value = (req as Record<string, unknown>)[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw rpcError(GrpcStatus.INVALID_ARGUMENT, `${field} is required`);
    }
  }
}

function requirePhotos(field: string, urls: string[] | undefined) {
  if (!urls?.length || urls.some((url) => typeof url !== 'string' || !url.trim())) {
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

  create(req: Pick<Ticket, 'category' | 'location' | 'description' | 'photoUrls' | 'reporterEmail'>) {
    requireFields(req, 'category', 'location', 'description', 'reporterEmail');
    const ticket = this.tickets.create({
      category: req.category,
      location: req.location,
      description: req.description,
      photoUrls: requirePhotos('photoUrls', req.photoUrls),
      completionPhotoUrls: [],
      reporterEmail: req.reporterEmail,
    });
    return this.setStatus(ticket, 'SUBMITTED', 'Ticket created');
  }

  async list(req: { status?: string; departmentId?: string; reporterEmail?: string; includeCancelled?: boolean }) {
    const tickets = await this.tickets.find({
      where: {
        ...(req.status && { status: req.status }),
        ...(req.departmentId && { departmentId: req.departmentId }),
        ...(req.reporterEmail && { reporterEmail: req.reporterEmail }),
      },
      order: { createdAt: 'DESC' },
    });
    return { tickets: req.includeCancelled ? tickets : tickets.filter((t) => t.status !== 'CANCELLED') };
  }

  async getHistory(id: string) {
    const ticket = await this.load(id);
    const history = await this.history.find({ where: { ticketId: ticket.id }, order: { id: 'ASC' } });
    return { ticket, history };
  }

  async assign(req: { id: string; departmentId: string }) {
    const ticket = await this.load(req.id, 'SUBMITTED', 'ASSIGNED');
    requireFields(req, 'departmentId');
    const department = await this.fetchDepartment(req.departmentId);
    ticket.departmentId = department.id;
    ticket.departmentName = department.name;
    return this.setStatus(ticket, 'ASSIGNED', `Assigned to ${department.name}`, department.contactEmail);
  }

  async cancel(id: string) {
    const ticket = await this.load(id, 'SUBMITTED');
    return this.setStatus(ticket, 'CANCELLED', 'Cancelled by reporter');
  }

  async reject(req: { id: string; reason: string }) {
    const ticket = await this.load(req.id, 'SUBMITTED');
    requireFields(req, 'reason');
    ticket.reason = req.reason;
    return this.setStatus(ticket, 'REJECTED', req.reason, ticket.reporterEmail);
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
    ticket.reason = req.reason;
    return this.setStatus(ticket, 'IN_PROGRESS', req.reason, ticket.reporterEmail);
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

  // Every status change goes through here: save the ticket, write one history row, then notify.
  private async setStatus(ticket: Ticket, toStatus: string, note: string, notifyEmail?: string) {
    const now = new Date().toISOString();
    const fromStatus = ticket.status ?? '';
    ticket.status = toStatus;
    ticket.createdAt ??= now;
    ticket.updatedAt = now;
    const saved = await this.tickets.manager.transaction(async (manager) => {
      const saved = await manager.save(ticket);
      await manager.save(TicketHistory, { ticketId: saved.id, fromStatus, toStatus, note, changedAt: now });
      return saved;
    });
    if (notifyEmail) this.publishStatusChanged(saved, notifyEmail);
    return saved;
  }

  // Drops the event on RabbitMQ and returns without waiting for Notification Service.
  // The event carries everything an email needs, so the consumer never calls back here.
  // eventId lets the consumer drop a redelivered copy; requestId joins the logs of all three services.
  // ponytail: the ticket is committed before the event is published. If the broker is down at that moment the
  // event is lost (logged below); a transactional outbox would close that gap.
  private publishStatusChanged(ticket: Ticket, recipientEmail: string) {
    const eventId = randomUUID();
    const requestId = currentRequestId();
    const event = {
      eventId,
      requestId,
      ticketId: ticket.id,
      status: ticket.status,
      recipientEmail,
      category: ticket.category,
      location: ticket.location,
      description: ticket.description,
      changedAt: ticket.updatedAt,
    };
    const record = new RmqRecordBuilder(event).setOptions({ messageId: eventId, headers: { 'x-request-id': requestId } }).build();
    const where = `eventId=${eventId} requestId=${requestId} ticket=${ticket.id} status=${ticket.status}`;
    this.broker.emit('ticket.status_changed', record).subscribe({
      // Completes after RabbitMQ has confirmed the message (publisher confirm).
      complete: () => this.logger.log(`Queued ticket.status_changed ${where}`),
      // The status change is already committed; a broker failure must not undo it.
      error: (error) => this.logger.error(`Event NOT queued (lost) ${where}: ${error}`),
    });
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
