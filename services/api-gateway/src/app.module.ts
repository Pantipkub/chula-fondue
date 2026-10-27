import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.js';
import { DepartmentsController } from './departments.controller.js';
import { HealthController } from './health.controller.js';
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
          // In Docker Compose this is dns:///ticket-service:50051: a name, never a container IP.
          url: process.env.TICKET_SERVICE_URL ?? 'localhost:50051',
          // Keep empty strings and empty lists in the JSON instead of dropping them.
          loader: { defaults: true },
          channelOptions: {
            // grpc-js looks the name up again after a lost connection, but by default at most every 30 s.
            // 1 s lets the gateway find a re-created ticket-service container (new IP) within seconds.
            'grpc.dns_min_time_between_resolutions_ms': 1000,
            'grpc.initial_reconnect_backoff_ms': 500,
            'grpc.max_reconnect_backoff_ms': 3000,
          },
        },
      },
    ]),
  ],
  controllers: [HealthController, AuthController, TicketsController, DepartmentsController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
