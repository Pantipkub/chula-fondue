import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DepartmentsController } from './departments.controller.js';
import { TicketsController } from './tickets.controller.js';
import { DepartmentClient } from './department.client.js';
import { TicketClient } from './ticket.client.js';
import { HealthController } from './health.controller.js';

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
          channelOptions: { 'grpc.enable_retries': 0 },
        },
      },
    ]),
  ],
  controllers: [TicketsController, DepartmentsController, HealthController],
  providers: [DepartmentClient, TicketClient],
})
export class AppModule {}
