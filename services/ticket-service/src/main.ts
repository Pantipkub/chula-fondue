import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

// gRPC for the gateway (port 50051) plus a small HTTP port for health checks (8081).
const app = await NestFactory.create(AppModule);
// Optional (set in k8s/): close each client connection after this many ms, gracefully, so clients resolve
// the service name again and start using newly added replicas. Unset in Compose: connections stay open.
const maxConnectionAgeMs = Number(process.env.GRPC_MAX_CONNECTION_AGE_MS ?? 0);
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: 'ticket',
    protoPath: join(import.meta.dirname, '../../../proto/ticket.proto'),
    url: process.env.TICKET_GRPC_URL ?? '0.0.0.0:50051',
    ...(maxConnectionAgeMs > 0 && {
      channelOptions: { 'grpc.max_connection_age_ms': maxConnectionAgeMs, 'grpc.max_connection_age_grace_ms': 10000 },
    }),
  },
});
app.enableShutdownHooks();
await app.startAllMicroservices();
await app.listen(process.env.HEALTH_PORT ?? 8081);
