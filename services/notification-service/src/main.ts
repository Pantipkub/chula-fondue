import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
    // Queue name and options must match ticket-service/src/app.module.ts.
    queue: 'notifications',
    queueOptions: { durable: true },
    // Messages stay in the queue until the handler acknowledges them.
    noAck: false,
  },
});
await app.listen();
