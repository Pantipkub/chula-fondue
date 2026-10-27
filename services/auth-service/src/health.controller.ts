import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

const CHECK_TIMEOUT_MS = 2000;

// /health       liveness: the process answers (the name auth-service resolves and the port is open).
// /health/ready readiness: it can also do its work, i.e. its own PostgreSQL database answers.
// Finding a service and the service being ready are separate questions; Docker DNS only answers the first.
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  live() {
    return { status: 'ok', service: 'auth-service' };
  }

  @Get('ready')
  async ready() {
    const database = await Promise.race([
      this.dataSource.query('SELECT 1').then(() => 'up', () => 'down'),
      new Promise<string>((resolve) => setTimeout(resolve, CHECK_TIMEOUT_MS, 'down')),
    ]);
    const body = { status: database === 'up' ? 'ready' : 'not_ready', service: 'auth-service', checks: { database } };
    if (database !== 'up') throw new ServiceUnavailableException(body);
    return body;
  }
}
