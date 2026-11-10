import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { AuthMail, PasswordReset } from './password-reset.entity.js';

@Injectable()
export class AuthMailService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private logger = new Logger('AuthMail');
  constructor(private readonly db: DataSource) {}
  onModuleInit() { this.timer = setInterval(() => void this.tick(), 2000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.db.transaction(async manager => {
        const now = new Date().toISOString();
        await manager.delete(AuthMail, { expiresAt: LessThanOrEqual(now) });
        await manager.delete(PasswordReset, { expiresAt: LessThanOrEqual(now) });
        const mail = await manager.findOne(AuthMail, { where: { nextAttemptAt: LessThanOrEqual(now) }, order: { nextAttemptAt: 'ASC' }, lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' } });
        if (!mail) return;
        try {
          const response = await fetch(`${process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:8082'}/internal/password-reset`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mail), signal: AbortSignal.timeout(3000),
          });
          if (!response.ok) throw new Error('Notification Service unavailable');
          await manager.delete(AuthMail, { eventId: mail.eventId });
        } catch {
          mail.attempts++;
          mail.nextAttemptAt = new Date(Date.now() + Math.min(60000, 2 ** Math.min(mail.attempts, 6) * 1000)).toISOString();
          await manager.save(mail);
        }
      });
    } catch { this.logger.warn('Recovery mail delivery pending; will retry'); }
    finally { this.busy = false; }
  }
}
