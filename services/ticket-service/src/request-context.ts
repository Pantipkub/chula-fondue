import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Metadata } from '@grpc/grpc-js';
import { Logger } from '@nestjs/common';

// Carries the gateway's request id through one gRPC call, so the RabbitMQ event published during that
// call can carry it on to Notification Service.
const storage = new AsyncLocalStorage<{ requestId: string }>();
const logger = new Logger('TicketRpc');
const READ_ONLY = new Set(['ListTickets', 'GetTicketHistory']);

export const currentRequestId = () => storage.getStore()?.requestId ?? '';

/** Runs one RPC handler with the request id from its metadata, and logs every change and every failure. */
export function withRequestContext<T>(metadata: Metadata | undefined, rpc: string, work: () => Promise<T>) {
  const requestId = String(metadata?.get('x-request-id')[0] ?? '') || randomUUID();
  return storage.run({ requestId }, async () => {
    const started = performance.now();
    try {
      const result = await work();
      // Successful reads are not logged so a load test does not flood the log.
      if (!READ_ONLY.has(rpc)) logger.log(`${rpc} ok ${(performance.now() - started).toFixed(1)}ms requestId=${requestId}`);
      return result;
    } catch (error) {
      const { message } = error as Error;
      logger.warn(`${rpc} failed ${(performance.now() - started).toFixed(1)}ms requestId=${requestId}: ${message}`);
      throw error;
    }
  });
}
