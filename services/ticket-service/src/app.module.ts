import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket, TicketHistory } from './ticket.entity.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.TICKET_DATABASE_URL ?? 'postgresql://fondue:fondue@localhost:5433/ticket',
      entities: [Ticket, TicketHistory],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Ticket, TicketHistory]),
    ClientsModule.register([
      {
        name: 'NOTIFICATION_BROKER',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
          // Queue name and options must match notification-service/src/main.ts.
          queue: 'notifications',
          queueOptions: { durable: true },
          persistent: true,
        },
      },
    ]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class AppModule {}
