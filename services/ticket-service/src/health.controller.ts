import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { DataSource } from 'typeorm';

const CHECK_TIMEOUT_MS = 2000;

// Ticket Service speaks gRPC to the gateway; this small HTTP port (HEALTH_PORT, default 8081) exists only
// for Docker's healthcheck and for people checking the system.
// /health       liveness
// /health/ready PostgreSQL must answer. RabbitMQ is reported but does not make the service "not ready":
//               tickets can still change status without it (those events are lost, see tickets.service.ts).
@Controller('health')
export class HealthController {
  private broker = 'connecting';

  constructor(
    private readonly dataSource: DataSource,
    @Inject('NOTIFICATION_BROKER') brokerClient: ClientProxy,
  ) {
    brokerClient.status.subscribe((status) => (this.broker = String(status)));
  }

  @Get()
  live() {
    return { status: 'ok', service: 'ticket-service' };
  }

  @Get('ready')
  async ready() {
    const database = await Promise.race([
      this.dataSource.query('SELECT 1').then(() => 'up', () => 'down'),
      new Promise<string>((resolve) => setTimeout(resolve, CHECK_TIMEOUT_MS, 'down')),
    ]);
    const broker = this.broker === 'connected' || this.broker === 'unblocked' ? 'up' : 'down';
    let status = 'ready';
    if (database !== 'up') status = 'not_ready';
    else if (broker !== 'up') status = 'degraded';
    const body = { status, service: 'ticket-service', checks: { database, rabbitmq: broker } };
    if (status === 'not_ready') throw new ServiceUnavailableException(body);
    return body;
  }
}
