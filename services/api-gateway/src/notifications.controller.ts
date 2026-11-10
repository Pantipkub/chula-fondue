import { Controller, Get, Put, Param, HttpCode, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from './auth.js';
import { currentRequestId } from './request-context.js';
@Controller('notifications')
export class NotificationsController {
  @Get()
  @Roles('ADMIN', 'REPORTER', 'STAFF')
  async list(@CurrentUser() user: AuthUser) {
    return this.forward(user);
  }
  @Put(':id/read') @HttpCode(204)
  @Roles('ADMIN', 'REPORTER', 'STAFF')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.forward(user, id);
  }
  private async forward(user: AuthUser, id?: string) {
    const url = new URL(id ? `/notifications/${encodeURIComponent(id)}/read` : '/notifications', process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:8082');
    url.searchParams.set('viewerId', user.sub);
    if (user.role !== 'ADMIN') {
      url.searchParams.set('recipientEmail', user.email);
      if (user.role === 'STAFF' && user.departmentId) url.searchParams.set('recipientDepartmentId', user.departmentId);
    }
    try {
      const response = await fetch(url, { method: id ? 'PUT' : 'GET', signal: AbortSignal.timeout(5000), headers: { 'X-Request-Id': currentRequestId() } });
      if (response.status === 404) throw new NotFoundException('Notification not found');
      if (!response.ok) throw new Error('upstream');
      return id ? undefined : await response.json();
    } catch (error) { if (error instanceof NotFoundException) throw error; throw new ServiceUnavailableException('Notification Service unavailable'); }
  }
}
