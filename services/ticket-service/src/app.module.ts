import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationStub } from './notification.stub.js';
import { Ticket, TicketHistory } from './ticket.entity.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

const database = process.env.TICKET_DB_PATH ?? join(import.meta.dirname, '..', 'ticket.sqlite');
mkdirSync(dirname(database), { recursive: true });

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database,
      entities: [Ticket, TicketHistory],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Ticket, TicketHistory]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, NotificationStub],
})
export class AppModule {}
