import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.js';
import { DepartmentsController } from './departments.controller.js';
import { TicketsController } from './tickets.controller.js';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'TICKET_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'ticket',
          protoPath: join(import.meta.dirname, '../../../proto/ticket.proto'),
          url: process.env.TICKET_SERVICE_URL ?? 'localhost:50051',
          // Keep empty strings and empty lists in the JSON instead of dropping them.
          loader: { defaults: true },
        },
      },
    ]),
  ],
  controllers: [AuthController, TicketsController, DepartmentsController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
