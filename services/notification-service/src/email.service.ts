import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationStore } from './notification-store.js';

export interface EmailEvent { eventId: string; ticketId: string; recipientEmail: string; status: string; description: string; }
export function rawMessage(event: EmailEvent, from: string) {
  if ([from, event.recipientEmail].some(value => /[\r\n]/.test(value))) throw new Error('Invalid email header');
  const subject = Buffer.from(`Chula Fondue: ${event.status} (${event.ticketId.slice(0, 8)})`).toString('base64');
  const body = Buffer.from(`Ticket: ${event.ticketId}\nStatus: ${event.status}\n\n${event.description}\n\nOpen Chula Fondue to track your report.`).toString('base64');
  return Buffer.from([
    `From: ${from}`, `To: ${event.recipientEmail}`, `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: <${event.eventId}@chula-fondue.local>`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body,
  ].join('\r\n')).toString('base64url');
}

export class GmailClient {
  private token = '';
  private expires = 0;
  constructor(private readonly request: typeof fetch = fetch) {}
  async send(event: EmailEvent) {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM } = process.env;
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_FROM) throw new Error('Gmail credentials are not configured');
    if (Date.now() > this.expires) {
      const response = await this.request('https://oauth2.googleapis.com/token', {
        method: 'POST', body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
          refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Gmail authorization returned ${response.status}`);
      const data = await response.json() as { access_token: string; expires_in: number };
      this.token = data.access_token; this.expires = Date.now() + (data.expires_in - 60) * 1000;
    }
    const response = await this.request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rawMessage(event, GMAIL_FROM) }), signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) this.expires = 0;
    if (!response.ok) throw new Error(`Gmail send returned ${response.status}`);
    return (await response.json() as { id: string }).id;
  }
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EmailWorker');
  private readonly gmail = new GmailClient();
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  onModuleInit() {
    if (process.env.EMAIL_MODE === 'gmail') this.timer = setInterval(() => void this.tick(), 3000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  constructor(private readonly store: NotificationStore) {}
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const collection = await this.store.collection();
      // Leases recover unfinished deliveries after a crash. Gmail itself offers no exactly-once send.
      const record = await collection.findOneAndUpdate({
        delivery: { $in: ['PENDING', 'RETRY', 'SENDING'] },
        nextAttemptAt: { $lte: new Date().toISOString() },
      }, { $set: { delivery: 'SENDING', nextAttemptAt: new Date(Date.now() + 60000).toISOString() }, $inc: { attempts: 1 } }, { returnDocument: 'after' });
      if (!record) return;
      try {
        const messageId = await this.gmail.send(record as unknown as EmailEvent);
        await collection.updateOne({ _id: record._id }, { $set: { delivery: 'SENT', messageId, sentAt: new Date().toISOString() } });
      } catch (error) {
        await collection.updateOne({ _id: record._id }, { $set: {
          delivery: record.attempts >= 5 ? 'FAILED' : 'RETRY', error: (error as Error).message,
          nextAttemptAt: new Date(Date.now() + 2 ** record.attempts * 5000).toISOString(),
        } });
      }
    } catch (error) { this.logger.warn(`Email worker retry: ${(error as Error).message}`); }
    finally { this.busy = false; }
  }
}
