import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// One request id per incoming HTTP request. It is returned to the caller as X-Request-Id and forwarded
// to every service the gateway calls (HTTP header or gRPC metadata), so logs can be joined end to end.
const storage = new AsyncLocalStorage<{ requestId: string }>();
const logger = new Logger('HTTP');
const SAFE_ID = /^[\w.-]{1,64}$/;

export const currentRequestId = () => storage.getStore()?.requestId ?? '';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  const started = process.hrtime.bigint();
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    // Reads that succeed are not logged, so a load test does not flood the log; health probes never are.
    if (req.path.startsWith('/health') || (req.method === 'GET' && res.statusCode < 400)) return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms.toFixed(1)}ms requestId=${requestId}`);
  });
  storage.run({ requestId }, next);
}
