import { GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { currentRequestId } from './request-context.js';

/** How long the gateway waits for a REST service (connect + full response) before answering 504. */
export const REST_TIMEOUT_MS = Number(process.env.REST_TIMEOUT_MS ?? 5000);

// Forwards the same method, path and JSON body to a REST service and returns its status and body unchanged.
// baseUrl is a discovery name such as http://auth-service:3002, resolved by Docker DNS on every new connection.
export async function proxyRest(serviceName: string, baseUrl: string, req: Request, res: Response) {
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
  let status: number;
  let contentType: string | null;
  let body: string;
  try {
    const upstream = await fetch(baseUrl + req.originalUrl, {
      method: req.method,
      headers: {
        'X-Request-Id': currentRequestId(),
        ...(hasBody && { 'Content-Type': 'application/json' }),
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    status = upstream.status;
    contentType = upstream.headers.get('content-type');
    body = await upstream.text();
  } catch (error) {
    if ((error as Error).name === 'TimeoutError') {
      throw new GatewayTimeoutException(`${serviceName} did not answer within ${REST_TIMEOUT_MS} ms`);
    }
    throw new ServiceUnavailableException(`${serviceName} unreachable`);
  }
  if (contentType) res.setHeader('Content-Type', contentType);
  res.status(status).send(body);
}
