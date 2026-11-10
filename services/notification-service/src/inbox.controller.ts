import { Controller, Get, Query, Put, Param, HttpCode, NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationStore } from './notification-store.js';
@Controller('notifications')
export class InboxController {
  constructor(private readonly store: NotificationStore) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const rows = await (await this.store.collection()).find(notificationScope(query))
      .project({ _id: 0, eventId: 1, ticketId: 1, recipientEmail: 1, recipientDepartmentId: 1, status: 1, delivery: 1, receivedAt: 1, sentAt: 1, attempts: 1, readBy: 1 })
      .sort({ receivedAt: -1 }).limit(100).toArray();
    return rows.map(({ readBy, ...row }) => ({ ...row, read: Array.isArray(readBy) && readBy.includes(query.viewerId) }));
  }
  @Put(':id/read') @HttpCode(204)
  async read(@Param('id') id: string, @Query() query: Record<string, string>) {
    if (!query.viewerId) throw new BadRequestException('viewerId is required');
    const result = await (await this.store.collection()).updateOne({ ...notificationScope(query), eventId: id }, { $addToSet: { readBy: query.viewerId } });
    if (!result.matchedCount) throw new NotFoundException('Notification not found');
  }
}

// Gateway supplies this scope from verified account claims, never from browser query parameters.
export function notificationScope(query: Record<string, string>) {
  const recipients: Record<string, string>[] = [];
  if (query.recipientEmail) recipients.push({ recipientEmail: query.recipientEmail });
  if (query.recipientDepartmentId) recipients.push({ recipientDepartmentId: query.recipientDepartmentId });
  return { kind: { $ne: 'PASSWORD_RESET' }, ...(recipients.length ? { $or: recipients } : {}) };
}
