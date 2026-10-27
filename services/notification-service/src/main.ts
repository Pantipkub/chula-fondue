import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { brokerState } from './health.controller.js';

// RabbitMQ consumer plus a small HTTP port for health checks (8082).
const app = await NestFactory.create(AppModule);
const consumer = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
    // Queue name and options must match ticket-service/src/app.module.ts.
    queue: 'notifications',
    queueOptions: { durable: true },
    // Messages stay in the queue until the handler acknowledges them.
    noAck: false,
    // At most 10 unacknowledged messages in flight; the rest wait in RabbitMQ.
    prefetchCount: 10,
    // Detect a dead broker connection within ~10 s and try to reconnect every 2 s.
    socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 2 },
  },
});
consumer.status.subscribe((status) => (brokerState.status = String(status)));
app.enableShutdownHooks();
await app.startAllMicroservices();
await app.listen(process.env.HEALTH_PORT ?? 8082);
