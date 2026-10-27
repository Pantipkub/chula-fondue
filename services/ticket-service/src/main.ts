import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { RpcObservabilityInterceptor } from './observability.js';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'ticket',
    protoPath: join(import.meta.dirname, '../../../proto/ticket.proto'),
    url: process.env.TICKET_GRPC_URL ?? '0.0.0.0:50051',
  },
});
app.useGlobalInterceptors(new RpcObservabilityInterceptor());
await app.listen();
