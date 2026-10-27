import type { Metadata } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { withRequestContext } from './request-context.js';
import { TicketsService } from './tickets.service.js';

@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @GrpcMethod('TicketService', 'CreateTicket')
  createTicket(req: Parameters<TicketsService['create']>[0], metadata: Metadata) {
    return withRequestContext(metadata, 'CreateTicket', () => this.tickets.create(req));
  }

  @GrpcMethod('TicketService', 'ListTickets')
  listTickets(req: Parameters<TicketsService['list']>[0], metadata: Metadata) {
    return withRequestContext(metadata, 'ListTickets', () => this.tickets.list(req));
  }

  @GrpcMethod('TicketService', 'GetTicketHistory')
  getTicketHistory(req: { id: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'GetTicketHistory', () => this.tickets.getHistory(req.id));
  }

  @GrpcMethod('TicketService', 'AssignTicket')
  assignTicket(req: { id: string; departmentId: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'AssignTicket', () => this.tickets.assign(req));
  }

  @GrpcMethod('TicketService', 'CancelTicket')
  cancelTicket(req: { id: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'CancelTicket', () => this.tickets.cancel(req.id));
  }

  @GrpcMethod('TicketService', 'RejectTicket')
  rejectTicket(req: { id: string; reason: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'RejectTicket', () => this.tickets.reject(req));
  }

  @GrpcMethod('TicketService', 'StartProgress')
  startProgress(req: { id: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'StartProgress', () => this.tickets.startProgress(req.id));
  }

  @GrpcMethod('TicketService', 'ResolveTicket')
  resolveTicket(req: { id: string; completionPhotoUrls?: string[] }, metadata: Metadata) {
    return withRequestContext(metadata, 'ResolveTicket', () => this.tickets.resolve(req));
  }

  @GrpcMethod('TicketService', 'ConfirmResolution')
  confirmResolution(req: { id: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'ConfirmResolution', () => this.tickets.confirmResolution(req.id));
  }

  @GrpcMethod('TicketService', 'ReopenTicket')
  reopenTicket(req: { id: string; reason: string }, metadata: Metadata) {
    return withRequestContext(metadata, 'ReopenTicket', () => this.tickets.reopen(req));
  }
}
