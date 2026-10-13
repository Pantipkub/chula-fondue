import { ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';

// Forwards the same method, path and JSON body to a REST service and returns its status and body unchanged.
export async function proxyRest(serviceName: string, baseUrl: string, req: Request, res: Response) {
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(baseUrl + req.originalUrl, {
      method: req.method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
  } catch {
    throw new ServiceUnavailableException(`${serviceName} unreachable`);
  }
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  res.status(upstream.status).send(await upstream.text());
}
