import { Injectable, Logger } from '@nestjs/common';

// Stub: real email sending is out of scope, so a notification is only a log line.
@Injectable()
export class NotificationStub {
  private readonly logger = new Logger('NotificationStub');

  notify(email: string, ticketId: string, status: string) {
    this.logger.log(`to=${email} ticket=${ticketId} status=${status}`);
  }
}
