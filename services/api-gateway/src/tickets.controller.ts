import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';

type TicketRpc = (request: object) => Observable<unknown>;

const HTTP_STATUS_BY_GRPC_CODE: Record<number, number> = {
  [GrpcStatus.NOT_FOUND]: 404,
  [GrpcStatus.INVALID_ARGUMENT]: 400,
  [GrpcStatus.FAILED_PRECONDITION]: 409,
  [GrpcStatus.UNAVAILABLE]: 503,
};

// No business logic here: every route forwards to one TicketService RPC.
@Controller('tickets')
export class TicketsController implements OnModuleInit {
  private ticketService: Record<string, TicketRpc>;

  constructor(@Inject('TICKET_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.ticketService = this.client.getService('TicketService');
  }

  @Post()
  create(@Body() body: object) {
    return this.forward('createTicket', body);
  }

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.forward('listTickets', {
      status: query.status,
      departmentId: query.departmentId,
      reporterEmail: query.reporterEmail,
      includeCancelled: query.includeCancelled === 'true',
    });
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.forward('getTicketHistory', { id });
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@Param('id') id: string, @Body('departmentId') departmentId: string) {
    return this.forward('assignTicket', { id, departmentId });
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.forward('cancelTicket', { id });
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.forward('rejectTicket', { id, reason });
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id') id: string) {
    return this.forward('startProgress', { id });
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@Param('id') id: string, @Body('completionPhotoUrl') completionPhotoUrl: string) {
    return this.forward('resolveTicket', { id, completionPhotoUrl });
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Param('id') id: string) {
    return this.forward('confirmResolution', { id });
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Param('id') id: string, @Body('reason') reason: string) {
    return this.forward('reopenTicket', { id, reason });
  }

  private async forward(rpc: string, request: object) {
    try {
      return await firstValueFrom(this.ticketService[rpc](request));
    } catch (error) {
      const { code, details, message } = error as { code?: number; details?: string; message?: string };
      throw new HttpException(details || message || 'Ticket Service error', HTTP_STATUS_BY_GRPC_CODE[code ?? -1] ?? 500);
    }
  }
}
