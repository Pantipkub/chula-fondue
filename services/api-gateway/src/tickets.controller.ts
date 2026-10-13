import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { CurrentUser, Roles } from './auth.js';
import type { AuthUser } from './auth.js';
import { PhotosInterceptor, storePhotos } from './photo-storage.js';
import type { UploadedPhoto } from './photo-storage.js';

type TicketRpc = (request: object) => Observable<unknown>;
type TicketWithHistory = { ticket: { departmentId: string; reporterEmail: string }; history: unknown[] };

const HTTP_STATUS_BY_GRPC_CODE: Record<number, number> = {
  [GrpcStatus.NOT_FOUND]: 404,
  [GrpcStatus.INVALID_ARGUMENT]: 400,
  [GrpcStatus.FAILED_PRECONDITION]: 409,
  [GrpcStatus.UNAVAILABLE]: 503,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Decides who may call what, stores uploaded photos, then forwards to one TicketService RPC.
// Ticket rules (statuses, required fields) stay in Ticket Service.
@Controller('tickets')
export class TicketsController implements OnModuleInit {
  private ticketService: Record<string, TicketRpc>;

  constructor(@Inject('TICKET_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.ticketService = this.client.getService('TicketService');
  }

  // multipart/form-data: category, location, description, photos (1-5 files), contactEmail (guests only)
  @Post()
  @Roles('REPORTER', 'GUEST')
  @UseInterceptors(PhotosInterceptor)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, string> = {},
    @UploadedFiles() photos?: UploadedPhoto[],
  ) {
    // A logged-in reporter is identified by the token; a guest has no account and must leave an address.
    const reporterEmail = user.role === 'GUEST' ? body.contactEmail?.trim().toLowerCase() : user.email;
    if (!reporterEmail || !EMAIL.test(reporterEmail)) {
      throw new BadRequestException('contactEmail must be a valid email address for guest reporters');
    }
    const photoUrls = await storePhotos(photos);
    return this.forward('createTicket', {
      category: body.category,
      location: body.location,
      description: body.description,
      photoUrls,
      reporterEmail,
    });
  }

  // Admin sees everything, Staff their department's queue, a Reporter their own tickets.
  @Get()
  @Roles('ADMIN', 'STAFF', 'REPORTER')
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    let scope: { departmentId?: string; reporterEmail?: string };
    if (user.role === 'ADMIN') scope = { departmentId: query.departmentId, reporterEmail: query.reporterEmail };
    else if (user.role === 'STAFF' && user.departmentId) scope = { departmentId: user.departmentId };
    else if (user.role === 'REPORTER' && user.email) scope = { reporterEmail: user.email };
    else throw new ForbiddenException('Your account cannot list tickets');
    return this.forward('listTickets', {
      status: query.status,
      ...scope,
      includeCancelled: query.includeCancelled === 'true',
    });
  }

  // Guests have no ticket list, so knowing the ticket id is what lets them follow their report.
  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.loadPermitted(user, id);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles('ADMIN')
  assign(@Param('id') id: string, @Body('departmentId') departmentId: string) {
    return this.forward('assignTicket', { id, departmentId });
  }

  @Delete(':id')
  @Roles('REPORTER')
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.loadPermitted(user, id);
    return this.forward('cancelTicket', { id });
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('ADMIN')
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.forward('rejectTicket', { id, reason });
  }

  @Post(':id/start')
  @HttpCode(200)
  @Roles('STAFF')
  async start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.loadPermitted(user, id);
    return this.forward('startProgress', { id });
  }

  // multipart/form-data: photos (1-5 files)
  @Post(':id/resolve')
  @HttpCode(200)
  @Roles('STAFF')
  @UseInterceptors(PhotosInterceptor)
  async resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFiles() photos?: UploadedPhoto[]) {
    await this.loadPermitted(user, id);
    const completionPhotoUrls = await storePhotos(photos);
    return this.forward('resolveTicket', { id, completionPhotoUrls });
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles('REPORTER')
  async confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.loadPermitted(user, id);
    return this.forward('confirmResolution', { id });
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @Roles('REPORTER')
  async reopen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('reason') reason: string) {
    await this.loadPermitted(user, id);
    return this.forward('reopenTicket', { id, reason });
  }

  // Fetches the ticket and checks it is the caller's: Staff need the same department, a Reporter the same email.
  private async loadPermitted(user: AuthUser, id: string) {
    const result = (await this.forward('getTicketHistory', { id })) as TicketWithHistory;
    const { departmentId, reporterEmail } = result.ticket;
    const permitted =
      user.role === 'ADMIN' ||
      user.role === 'GUEST' ||
      (user.role === 'STAFF' && !!departmentId && departmentId === user.departmentId) ||
      (user.role === 'REPORTER' && reporterEmail === user.email);
    if (!permitted) {
      throw new ForbiddenException(
        user.role === 'STAFF' ? 'This ticket is not assigned to your department' : 'This ticket is not yours',
      );
    }
    return result;
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
