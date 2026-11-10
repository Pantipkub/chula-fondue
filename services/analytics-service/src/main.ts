import 'reflect-metadata';
import { BadRequestException, Controller, Get, Module, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Ctx, EventPattern, MicroserviceOptions, Payload, RmqContext, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm';
import { aggregate, TicketMetric } from './analytics.js';

const databaseUrl = process.env.ANALYTICS_DATABASE_URL;
if (!databaseUrl?.trim()) throw new Error('ANALYTICS_DATABASE_URL is required');

@Entity()
class Metric {
  @PrimaryColumn('uuid') ticketId: string;
  @Column('int') version: number;
  @Column('jsonb') data: TicketMetric;
}
@Controller()
class AnalyticsController {
  constructor(private readonly db: DataSource) {}
  @Get('health') live() { return { status: 'ok', service: 'analytics-service' }; }
  @Get('health/ready') async ready() { await this.db.query('SELECT 1'); return { status: 'ready' }; }
  @Get('analytics') async report(@Query() query: Record<string, string>) {
    for (const key of ['from', 'to']) {
      if (query[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(query[key]) || !Number.isFinite(Date.parse(query[key])))) { throw new BadRequestException(`${key} must be YYYY-MM-DD`); }
    }
    if (query.from && query.to && query.from > query.to) { throw new BadRequestException('from must not be after to'); }
    const rows = (await this.db.getRepository(Metric).find()).map(r => r.data).filter(r =>
      (!query.from || r.createdAt.slice(0, 10) >= query.from) && (!query.to || r.createdAt.slice(0, 10) <= query.to) &&
      (!query.category || r.category === query.category) && (!query.departmentId || r.departmentId === query.departmentId));
    return aggregate(rows);
  }
  @EventPattern('ticket.status_changed')
  async consume(@Payload() event: TicketMetric, @Ctx() ctx: unknown) {
    const context = ctx as RmqContext;
    const channel = context.getChannelRef(), message = context.getMessage();
    try {
      if (!event.ticketId || !Number.isInteger(event.version) || event.version < 1) { channel.nack(message, false, false); return; }
      // Atomic upsert prevents delayed/duplicate messages from replacing a newer projection.
      await this.db.query(`INSERT INTO metric ("ticketId", version, data) VALUES ($1, $2, $3)
        ON CONFLICT ("ticketId") DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data
        WHERE metric.version < EXCLUDED.version`, [event.ticketId, event.version, JSON.stringify(event)]);
      channel.ack(message);
    } catch { setTimeout(() => { try { channel.nack(message, false, true); } catch {} }, 5000); }
  }
}
@Module({ imports: [TypeOrmModule.forRoot({ type: 'postgres', url: databaseUrl, entities: [Metric], synchronize: true, retryAttempts: 20 })], controllers: [AnalyticsController] })
class AppModule {}
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>({ transport: Transport.RMQ, options: {
  urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'], queue: 'analytics',
  queueOptions: { durable: true }, noAck: false, prefetchCount: 20,
  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 2 },
} });
app.enableShutdownHooks();
await app.startAllMicroservices();
await app.listen(process.env.ANALYTICS_PORT ?? 3003);
