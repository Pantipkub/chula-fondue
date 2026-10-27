import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { Metadata, ServerUnaryCall } from '@grpc/grpc-js';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { finalize, Observable, tap } from 'rxjs';

type RpcCall = ServerUnaryCall<unknown, unknown>;
const context = new AsyncLocalStorage<{ requestId: string; call: RpcCall }>();

export function currentRpc() {
  return context.getStore();
}

export function assertRpcActive() {
  const call = currentRpc()?.call;
  if (!call) return;
  const deadline = call.getDeadline();
  const end = deadline instanceof Date ? deadline.getTime() : deadline;
  if (Date.now() >= end) throw new RpcException({ code: GrpcStatus.DEADLINE_EXCEEDED, message: 'Request deadline exceeded' });
  if (call.cancelled) throw new RpcException({ code: GrpcStatus.CANCELLED, message: 'Request cancelled' });
}

@Injectable()
export class RpcObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger('TicketRequests');

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = execution.getArgByIndex<Metadata>(1);
    const call = execution.getArgByIndex<RpcCall>(2);
    const incoming = metadata?.get('x-request-id')[0];
    const requestId = typeof incoming === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    const started = performance.now();
    let code: number = GrpcStatus.OK;
    // Subscription must start inside AsyncLocalStorage so asynchronous work
    // keeps the request context, including concurrent gRPC requests.
    return new Observable((observer) => context.run({ requestId, call }, () => next.handle().pipe(
      tap({ error: (error: unknown) => {
        const detail = error instanceof RpcException ? error.getError() : error;
        code = typeof detail === 'object' && detail !== null && 'code' in detail ? Number(detail.code) : GrpcStatus.INTERNAL;
      } }),
      finalize(() => this.logger.log(JSON.stringify({
        event: 'rpc_request', service: 'ticket-service', requestId,
        operation: execution.getHandler().name, grpcCode: code,
        durationMs: Math.round(performance.now() - started),
      }))),
    ).subscribe(observer)));
  }
}
