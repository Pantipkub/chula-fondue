import { BackgroundService } from './background.service.js';
import { OutboxEvent } from './outbox.entity.js';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller.js';
import { Ticket, TicketHistory } from './ticket.entity.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketRoutingJob } from './ticket-routing-job.entity.js';
import { AutoRoutingService } from './auto-routing.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.TICKET_DATABASE_URL ?? 'postgresql://fondue:fondue@localhost:5433/ticket',
      entities: [Ticket, TicketHistory, OutboxEvent, TicketRoutingJob],
      synchronize: true,
      // Keep retrying while PostgreSQL starts; Docker restarts the container if it never comes up.
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([Ticket, TicketHistory, OutboxEvent, TicketRoutingJob]),
    ClientsModule.register([
      { name: 'ANALYTICS_BROKER', transport: Transport.RMQ, options: {
        urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
        queue: 'analytics', queueOptions: { durable: true }, persistent: true,
        socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 2 },
      } },
      {
        name: 'NOTIFICATION_BROKER',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
          // Queue name and options must match notification-service/src/main.ts.
          queue: 'notifications',
          queueOptions: { durable: true },
          persistent: true,
          // Detect a dead broker connection within ~10 s and try to reconnect every 2 s.
          socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 2 },
        },
      },
    ]),
  ],
  controllers: [HealthController, TicketsController],
  providers: [TicketsService, BackgroundService, AutoRoutingService],
})
export class AppModule {}
