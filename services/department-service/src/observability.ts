import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('DepartmentRequests');

export function observeRequest(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : randomUUID();
  const started = performance.now();
  res.setHeader('x-request-id', requestId);
  res.once('finish', () => logger.log(JSON.stringify({
    event: 'http_request', service: 'department-service', requestId,
    operation: `${req.method} ${req.path}`, status: res.statusCode,
    durationMs: Math.round(performance.now() - started),
  })));
  next();
}
