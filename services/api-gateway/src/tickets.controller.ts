import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { TicketClient } from './ticket.client.js';

// No business logic here: every route forwards to one TicketService RPC.
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketClient) {}

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
    return this.tickets.call(rpc, request);
  }
}
