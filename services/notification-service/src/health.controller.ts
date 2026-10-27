import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { NotificationStore } from './notification-store.js';

const CHECK_TIMEOUT_MS = 2000;

/** Last connection status reported by the RabbitMQ consumer (set in main.ts). */
export const brokerState = { status: 'connecting' };

// /health       liveness
// /health/ready the consumer is connected to RabbitMQ. MongoDB is reported too; while it is down,
//               messages are handed back to RabbitMQ and retried, so nothing is lost.
@Controller('health')
export class HealthController {
  constructor(private readonly store: NotificationStore) {}

  @Get()
  live() {
    return { status: 'ok', service: 'notification-service' };
  }

  @Get('ready')
  async ready() {
    const mongodb = await Promise.race([
      this.store.ping().then(() => 'up', () => 'down'),
      new Promise<string>((resolve) => setTimeout(resolve, CHECK_TIMEOUT_MS, 'down')),
    ]);
    const rabbitmq = ['connected', 'unblocked'].includes(brokerState.status) ? 'up' : 'down';
    let status = 'ready';
    if (rabbitmq !== 'up') status = 'not_ready';
    else if (mongodb !== 'up') status = 'degraded';
    const body = { status, service: 'notification-service', checks: { rabbitmq, mongodb } };
    if (status === 'not_ready') throw new ServiceUnavailableException(body);
    return body;
  }
}
