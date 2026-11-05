import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from './auth.js';
import { currentRequestId } from './request-context.js';
@Controller('notifications')
export class NotificationsController {
  @Get()
  @Roles('ADMIN', 'REPORTER', 'STAFF')
  async list(@CurrentUser() user: AuthUser) {
    const url = new URL('/notifications', process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:8082');
    if (user.role !== 'ADMIN') url.searchParams.set('recipientEmail', user.email);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'X-Request-Id': currentRequestId() } });
      if (!response.ok) throw new Error('upstream');
      return await response.json();
    } catch { throw new ServiceUnavailableException('Notification Service unavailable'); }
  }
}
