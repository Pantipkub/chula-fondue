import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Ticket } from './ticket.entity.js';
import { autoRoutingEnabled, TicketRoutingJob } from './ticket-routing-job.entity.js';
import { TicketsService } from './tickets.service.js';

export interface RoutingClaim { ticket: Ticket; token: string; attempts: number; requestId: string; exhausted: boolean }
export type RoutingMatch = { result: 'MATCHED'; ruleId: string; category: string; department: { id: string; name: string; contactEmail: string } }
  | { result: 'NO_RULE' | 'AMBIGUOUS_RULES' };
const RETRY_DELAYS = [5000, 15000, 60000, 180000];
export const retryDelay = (attempts: number) => RETRY_DELAYS[attempts - 1];

@Injectable()
export class AutoRoutingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AutoRouting');
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private readonly db: DataSource, private readonly tickets: TicketsService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 2000);
    void this.tick();
  }
  onModuleDestroy() { if (this.timer) { clearInterval(this.timer); } }

  async claim(): Promise<RoutingClaim | undefined> {
    return this.db.transaction(async (manager) => {
      const now = new Date().toISOString();
      const job = await manager.getRepository(TicketRoutingJob).createQueryBuilder('j')
        .where('(j.state IN (:...states) AND j.nextAttemptAt <= :now) OR (j.state = :processing AND j.leaseUntil <= :now)',
          { states: ['PENDING', 'RETRY'], processing: 'PROCESSING', now })
        .orderBy('j.nextAttemptAt', 'ASC').addOrderBy('j.ticketId', 'ASC')
        .setLock('pessimistic_write').setOnLocked('skip_locked').take(1).getOne();
      if (!job) { return; }
      // No ticket lock here: every business transition locks ticket before job to avoid deadlocks.
      const ticket = await manager.findOneBy(Ticket, { id: job.ticketId });
      if (ticket?.status !== 'SUBMITTED') {
        job.state = ticket?.status === 'ASSIGNED' ? 'DONE' : 'STOPPED';
        job.leaseToken = ''; job.leaseUntil = ''; job.updatedAt = now;
        await manager.save(job);
        return;
      }
      const exhausted = job.attempts >= 5;
      if (!exhausted) { job.attempts++; }
      job.state = 'PROCESSING'; job.leaseToken = randomUUID();
      job.leaseUntil = new Date(Date.now() + 15000).toISOString(); job.updatedAt = now;
      await manager.save(job);
      return { ticket, token: job.leaseToken, attempts: job.attempts, requestId: job.requestId, exhausted };
    });
  }

  async tick() {
    if (this.busy || !autoRoutingEnabled()) { return; }
    this.busy = true;
    try {
      for (let i = 0; i < 10 && autoRoutingEnabled(); i++) {
        const claim = await this.claim();
        if (!claim) { break; }
        await this.routeClaim(claim);
      }
    } catch (error_) { this.logger.warn(`Routing will resume: ${(error_ as Error).message}`); }
    finally { this.busy = false; }
  }

  private async routeClaim(claim: RoutingClaim) {
    try {
      if (claim.exhausted) {
        await this.tickets.finishRouting(claim, 'RETRIES_EXHAUSTED');
        return;
      }
      const result = await this.match(claim);
      await this.tickets.finishRouting(claim, result);
      this.logger.log(`ticket=${claim.ticket.id} attempt=${claim.attempts} result=${result.result} requestId=${claim.requestId}`);
    } catch (error_) {
      // A manual action or a newer lease won. It must never be overwritten or rescheduled.
      if (error_ instanceof RpcException) return;
      const reason = error_ instanceof InvalidRoutingResponse ? 'INVALID_RULE' : 'SERVICE_UNAVAILABLE';
      const delay = reason === 'INVALID_RULE' ? undefined : retryDelay(claim.attempts);
      await this.tickets.finishRouting(claim, delay === undefined && reason !== 'INVALID_RULE' ? 'RETRIES_EXHAUSTED' : reason, delay)
        .catch((error_) => { if (!(error_ instanceof RpcException)) throw error_; });
      this.logger.warn(`ticket=${claim.ticket.id} attempt=${claim.attempts} reason=${reason} requestId=${claim.requestId}`);
    }
  }

  private async match(claim: RoutingClaim): Promise<RoutingMatch> {
    const response = await fetch(`${process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001'}/routing-rules/match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': claim.requestId },
      body: JSON.stringify({ category: claim.ticket.category }), signal: AbortSignal.timeout(3000),
    });
    if (response.status >= 500) { throw new Error('Department Service unavailable'); }
    if (!response.ok) { throw new InvalidRoutingResponse(); }
    let value: RoutingMatch;
    try { value = await response.json() as RoutingMatch; } catch (error_) {
      if (['AbortError', 'TimeoutError'].includes((error_ as Error).name)) { throw error_; }
      throw new InvalidRoutingResponse();
    }
    if (value?.result === 'NO_RULE' || value?.result === 'AMBIGUOUS_RULES') { return value; }
    if (value?.result !== 'MATCHED' || !uuid(value.ruleId) || !uuid(value.department?.id) ||
        typeof value.department?.name !== 'string' || !value.department.name.trim() ||
        !validRoutingEmail(value.department?.contactEmail) ||
        typeof value.category !== 'string' || value.category.toLowerCase() !== claim.ticket.category.trim().toLowerCase()) {
      throw new InvalidRoutingResponse();
    }
    return value;
  }
}
class InvalidRoutingResponse extends Error {}
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validRoutingEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 254 || /\s/.test(value)) return false;
  const separator = value.indexOf('@');
  const domainEnd = value.lastIndexOf('.');
  return separator > 0 && separator === value.lastIndexOf('@') && domainEnd > separator + 1 && domainEnd < value.length - 1;
}
