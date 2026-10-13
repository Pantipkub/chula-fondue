import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Collection } from 'mongodb';

// The event Ticket Service publishes on every status change that someone must hear about.
interface StatusChangedEvent {
  ticketId: string;
  status: string;
  recipientEmail: string;
  category: string;
  location: string;
  description: string;
  changedAt: string;
}

@Controller()
export class NotificationsController {
  private readonly logger = new Logger('NotificationService');

  constructor(@Inject('NOTIFICATIONS') private readonly notifications: Collection) {}

  @EventPattern('ticket.status_changed')
  async onStatusChanged(@Payload() event: StatusChangedEvent, @Ctx() ctx: unknown) {
    const context = ctx as RmqContext; // @EventPattern types handler arguments after the payload as unknown
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      // This iteration records the notification only. Sending through the Gmail API goes here,
      // after which `delivery` becomes SENT or FAILED.
      await this.notifications.insertOne({ ...event, receivedAt: new Date().toISOString(), delivery: 'RECORDED' });
    } catch (error) {
      // Hand the message back to RabbitMQ so it is delivered again once MongoDB is reachable.
      // ponytail: retries forever every 5 s; add a dead-letter queue if a message can be permanently bad.
      this.logger.error(`Could not record ticket=${event.ticketId}, will retry: ${error}`);
      setTimeout(() => channel.nack(message, false, true), 5000);
      return;
    }
    // Acknowledge only after the record is stored: if this service dies first, RabbitMQ redelivers.
    channel.ack(message);
    this.logger.log(`Recorded to=${event.recipientEmail} ticket=${event.ticketId} status=${event.status}`);
  }
}
