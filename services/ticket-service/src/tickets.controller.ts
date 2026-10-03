import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { TicketsService } from './tickets.service.js';

@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @GrpcMethod('TicketService', 'CreateTicket')
  createTicket(req: Parameters<TicketsService['create']>[0]) {
    return this.tickets.create(req);
  }

  @GrpcMethod('TicketService', 'ListTickets')
  listTickets(req: Parameters<TicketsService['list']>[0]) {
    return this.tickets.list(req);
  }

  @GrpcMethod('TicketService', 'GetTicketHistory')
  getTicketHistory(req: { id: string }) {
    return this.tickets.getHistory(req.id);
  }

  @GrpcMethod('TicketService', 'AssignTicket')
  assignTicket(req: { id: string; departmentId: string }) {
    return this.tickets.assign(req);
  }

  @GrpcMethod('TicketService', 'CancelTicket')
  cancelTicket(req: { id: string }) {
    return this.tickets.cancel(req.id);
  }

  @GrpcMethod('TicketService', 'RejectTicket')
  rejectTicket(req: { id: string; reason: string }) {
    return this.tickets.reject(req);
  }

  @GrpcMethod('TicketService', 'StartProgress')
  startProgress(req: { id: string }) {
    return this.tickets.startProgress(req.id);
  }

  @GrpcMethod('TicketService', 'ResolveTicket')
  resolveTicket(req: { id: string; completionPhotoUrl?: string }) {
    return this.tickets.resolve(req);
  }

  @GrpcMethod('TicketService', 'ConfirmResolution')
  confirmResolution(req: { id: string }) {
    return this.tickets.confirmResolution(req.id);
  }

  @GrpcMethod('TicketService', 'ReopenTicket')
  reopenTicket(req: { id: string; reason: string }) {
    return this.tickets.reopen(req);
  }
}
