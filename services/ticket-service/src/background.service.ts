import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { lastValueFrom, timeout } from 'rxjs';
import { OutboxEvent } from './outbox.entity.js';
import { TicketsService } from './tickets.service.js';

@Injectable()
export class BackgroundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TicketBackground');
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private readonly db: DataSource, private readonly tickets: TicketsService,
    @Inject('NOTIFICATION_BROKER') private readonly notifications: ClientProxy,
    @Inject('ANALYTICS_BROKER') private readonly analytics: ClientProxy) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 2000);
    void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.tickets.closeExpiredResolutions();
      // Keep publication inside a short row-lock transaction. SKIP LOCKED permits multiple workers.
      // A crash after broker confirmation may redeliver, so consumers deduplicate by eventId/version.
      await this.db.transaction(async (manager) => {
        const rows = await manager.getRepository(OutboxEvent).createQueryBuilder('e')
          .where('e.notificationSent = false OR e.analyticsSent = false').orderBy('e.createdAt', 'ASC')
          .setLock('pessimistic_write').setOnLocked('skip_locked').take(20).getMany();
        for (const row of rows) {
          const send = async (broker: ClientProxy) => {
            const record = new RmqRecordBuilder(row.payload).setOptions({ messageId: row.id }).build();
            await lastValueFrom(broker.emit('ticket.status_changed', record).pipe(timeout(1500)));
          };
          if (!row.notificationSent) { await send(this.notifications); row.notificationSent = true; }
          if (!row.analyticsSent) { await send(this.analytics); row.analyticsSent = true; }
          await manager.save(row);
        }
      });
      // Published events need no permanent retention. Ticket history remains the audit record.
      await this.db.getRepository(OutboxEvent).createQueryBuilder().delete()
        .where('"notificationSent" = true AND "analyticsSent" = true AND "createdAt" < :cutoff',
          { cutoff: new Date(Date.now() - 7 * 86400000).toISOString() }).execute();
    } catch (error) { this.logger.warn(`Background retry scheduled: ${(error as Error).message}`); }
    finally { this.busy = false; }
  }
}
