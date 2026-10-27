import { GatewayTimeoutException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getRequestId } from './observability.js';

const base = process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001';
export const REST_TIMEOUT_MS = 2000;

@Injectable()
export class DepartmentClient {
  private readonly logger = new Logger('DepartmentClient');

  async request(path: string, init: RequestInit = {}, timeoutMs = REST_TIMEOUT_MS) {
    const signal = AbortSignal.timeout(timeoutMs);
    const headers = new Headers(init.headers);
    const requestId = getRequestId();
    headers.set('x-request-id', requestId);
    const started = performance.now();
    let status = 503;
    try {
      const response = await fetch(base + path, { ...init, headers, signal });
      // Reading the body is part of the same timeout, not an unbounded second step.
      const text = await response.text();
      status = response.status;
      return { status, text, contentType: response.headers.get('content-type') };
    } catch {
      if (signal.aborted) {
        status = 504;
        throw new GatewayTimeoutException('Department Service timed out');
      }
      throw new ServiceUnavailableException('Department Service unreachable');
    } finally {
      this.logger.log(JSON.stringify({
        event: 'dependency_call', service: 'api-gateway', dependency: 'department-service',
        requestId, operation: init.method ?? 'GET', status,
        durationMs: Math.round(performance.now() - started),
      }));
    }
  }
}
