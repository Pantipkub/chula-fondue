import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

// gRPC for the gateway (port 50051) plus a small HTTP port for health checks (8081).
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: 'ticket',
    protoPath: join(import.meta.dirname, '../../../proto/ticket.proto'),
    url: process.env.TICKET_GRPC_URL ?? '0.0.0.0:50051',
  },
});
app.enableShutdownHooks();
await app.startAllMicroservices();
await app.listen(process.env.HEALTH_PORT ?? 8081);
