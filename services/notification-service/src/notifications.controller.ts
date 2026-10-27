import { Controller, Logger, OnModuleInit } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { NotificationStore } from './notification-store.js';

// The event Ticket Service publishes on every status change that someone must hear about.
interface StatusChangedEvent {
  eventId?: string; // missing on events published before Progress 3
  requestId?: string;
  ticketId: string;
  status: string;
  recipientEmail: string;
  category: string;
  location: string;
  description: string;
  changedAt: string;
}

@Controller()
export class NotificationsController implements OnModuleInit {
  private readonly logger = new Logger('NotificationService');

  constructor(private readonly store: NotificationStore) {}

  // Connect early so problems show in the log at startup. Not awaited: MongoDB may still be unreachable,
  // in which case the first message triggers a new attempt.
  onModuleInit() {
    this.store.collection().catch((error) => this.logger.warn(`MongoDB not reachable yet, will retry: ${error}`));
  }

  @EventPattern('ticket.status_changed')
  async onStatusChanged(@Payload() event: StatusChangedEvent, @Ctx() ctx: unknown) {
    const context = ctx as RmqContext; // @EventPattern types handler arguments after the payload as unknown
    const channel = context.getChannelRef();
    const message = context.getMessage();
    const where = `eventId=${event.eventId ?? '-'} requestId=${event.requestId ?? '-'} ticket=${event.ticketId} status=${event.status}`;
    let duplicate = false;
    try {
      // This iteration records the notification only. Sending through the Gmail API goes here,
      // after which `delivery` becomes SENT or FAILED.
      const notifications = await this.store.collection();
      const record = { ...event, receivedAt: new Date().toISOString(), delivery: 'RECORDED' };
      if (event.eventId) {
        // RabbitMQ delivers at least once: a message can arrive again if this service died before its ack.
        // Inserting only when the eventId is new makes a second delivery harmless.
        const result = await notifications.updateOne(
          { eventId: event.eventId },
          { $setOnInsert: record },
          { upsert: true },
        );
        duplicate = result.upsertedCount === 0;
      } else {
        await notifications.insertOne(record);
      }
    } catch (error) {
      // Hand the message back to RabbitMQ so it is delivered again once MongoDB is reachable.
      // ponytail: retries forever every 5 s; add a dead-letter queue if a message can be permanently bad.
      this.logger.error(`Could not record ${where}, will retry: ${error}`);
      setTimeout(() => this.settle(() => channel.nack(message, false, true), where), 5000);
      return;
    }
    // Acknowledge only after the record is stored: if this service dies first, RabbitMQ redelivers.
    if (!this.settle(() => channel.ack(message), where)) return;
    if (duplicate) this.logger.warn(`Duplicate ignored ${where}`);
    else this.logger.log(`Recorded to=${event.recipientEmail} ${where}`);
  }

  // ack/nack throw if the broker connection dropped in the meantime. That is harmless: RabbitMQ puts every
  // unacknowledged message back in the queue when a channel closes, so it is simply delivered again later.
  private settle(action: () => void, where: string) {
    try {
      action();
      return true;
    } catch (error) {
      this.logger.warn(`Channel closed before settling ${where}; RabbitMQ will redeliver it: ${error}`);
      return false;
    }
  }
}
