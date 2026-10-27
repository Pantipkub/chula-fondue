import { Controller, Get, HttpException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DepartmentClient } from './department.client.js';
import { TicketClient } from './ticket.client.js';

const HEALTH_TIMEOUT_MS = 750;
type Dependency = { status: 'up' | 'down'; reason?: string };

@Controller()
export class HealthController {
  constructor(private readonly departments: DepartmentClient, private readonly tickets: TicketClient) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const check = async (action: () => Promise<boolean>): Promise<Dependency> => {
      try {
        return await action() ? { status: 'up' } : { status: 'down', reason: 'not_ready' };
      } catch (error) {
        return { status: 'down', reason: error instanceof HttpException && error.getStatus() === 504 ? 'timeout' : 'unavailable' };
      }
    };
    const [department, ticket] = await Promise.all([
      check(async () => {
        const result = await this.departments.request('/ready', {}, HEALTH_TIMEOUT_MS);
        return result.status === 200 && JSON.parse(result.text).status === 'ready';
      }),
      check(async () => {
        const result = await this.tickets.call<{ status: string }>('checkHealth', {}, HEALTH_TIMEOUT_MS);
        return result.status === 'SERVING';
      }),
    ]);
    const ready = department.status === 'up' && ticket.status === 'up';
    response.status(ready ? 200 : 503);
    return { status: ready ? 'ready' : 'not_ready', service: 'api-gateway', dependencies: { department, ticket } };
  }
}
