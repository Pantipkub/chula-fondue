import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import type { CallOptions } from '@grpc/grpc-js';
import { HttpException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { getRequestId } from './observability.js';

type TicketRpc = (request: object, metadata: Metadata, options: CallOptions) => Observable<unknown>;
export const GRPC_DEADLINE_MS = 3000;

const HTTP_STATUS_BY_GRPC_CODE: Record<number, number> = {
  [GrpcStatus.NOT_FOUND]: 404,
  [GrpcStatus.INVALID_ARGUMENT]: 400,
  [GrpcStatus.FAILED_PRECONDITION]: 409,
  [GrpcStatus.UNAVAILABLE]: 503,
  [GrpcStatus.DEADLINE_EXCEEDED]: 504,
  [GrpcStatus.CANCELLED]: 503,
};

@Injectable()
export class TicketClient implements OnModuleInit {
  private service: Record<string, TicketRpc>;
  private readonly logger = new Logger('TicketClient');

  constructor(@Inject('TICKET_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.service = this.client.getService('TicketService');
  }

  async call<T = unknown>(rpc: string, request: object, timeoutMs = GRPC_DEADLINE_MS): Promise<T> {
    const requestId = getRequestId();
    const metadata = new Metadata();
    metadata.set('x-request-id', requestId);
    const started = performance.now();
    let code: number = GrpcStatus.OK;
    try {
      return await firstValueFrom(this.service[rpc](request, metadata, {
        deadline: new Date(Date.now() + timeoutMs),
      })) as T;
    } catch (error) {
      const failure = error as { code?: number; details?: string; message?: string };
      code = failure.code ?? GrpcStatus.INTERNAL;
      const message = code === GrpcStatus.DEADLINE_EXCEEDED
        ? 'Ticket Service timed out'
        : failure.details || failure.message || 'Ticket Service error';
      throw new HttpException(message, HTTP_STATUS_BY_GRPC_CODE[code] ?? 500);
    } finally {
      this.logger.log(JSON.stringify({
        event: 'dependency_call', service: 'api-gateway', dependency: 'ticket-service',
        requestId, operation: rpc, grpcCode: code,
        durationMs: Math.round(performance.now() - started),
      }));
    }
  }
}
