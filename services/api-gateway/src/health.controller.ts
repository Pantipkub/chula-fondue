import type { Client } from '@grpc/grpc-js';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { ClientGrpcProxy } from '@nestjs/microservices';
import { Public } from './auth.js';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
const DEPARTMENT_SERVICE_URL = process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001';
const CHECK_TIMEOUT_MS = 2000;

type Check = 'up' | 'down';

// /health      liveness: the gateway process answers. Docker's healthcheck uses this one, so a downstream
//              outage never makes Docker restart the gateway.
// /health/ready readiness: every service the gateway forwards to can be found by name AND answers.
@Controller('health')
@Public()
export class HealthController {
  constructor(@Inject('TICKET_PACKAGE') private readonly ticketClient: ClientGrpcProxy) {}

  @Get()
  live() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Get('ready')
  async ready() {
    const [auth, department, ticket] = await Promise.all([
      this.httpReady(`${AUTH_SERVICE_URL}/health/ready`),
      this.httpReady(`${DEPARTMENT_SERVICE_URL}/health/ready`),
      this.grpcReady(),
    ]);
    const checks = { 'auth-service': auth, 'department-service': department, 'ticket-service': ticket };
    const body = { status: Object.values(checks).every((c) => c === 'up') ? 'ready' : 'not_ready', checks };
    if (body.status !== 'ready') throw new ServiceUnavailableException(body);
    return body;
  }

  private async httpReady(url: string): Promise<Check> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      return response.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  // Waits until the gRPC channel to ticket-service is connected (DNS lookup + TCP + HTTP/2), or gives up.
  private grpcReady(): Promise<Check> {
    const client = this.ticketClient.getClientByServiceName('TicketService') as Client;
    return new Promise((resolve) =>
      client.waitForReady(Date.now() + CHECK_TIMEOUT_MS, (error) => resolve(error ? 'down' : 'up')),
    );
  }
}
