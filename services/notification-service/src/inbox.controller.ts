import { Controller, Get, Query } from '@nestjs/common';
import { NotificationStore } from './notification-store.js';
@Controller('notifications')
export class InboxController {
  constructor(private readonly store: NotificationStore) {}
  @Get() async list(@Query('recipientEmail') recipientEmail?: string) {
    return (await this.store.collection()).find(recipientEmail ? { recipientEmail } : {})
      .project({ _id: 0, eventId: 1, ticketId: 1, recipientEmail: 1, status: 1, delivery: 1, receivedAt: 1, sentAt: 1, attempts: 1 })
      .sort({ receivedAt: -1 }).limit(100).toArray();
  }
}
