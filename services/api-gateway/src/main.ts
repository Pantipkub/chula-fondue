import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { observeRequest } from './observability.js';

const app = await NestFactory.create(AppModule);
app.use(observeRequest);
await app.listen(process.env.GATEWAY_PORT ?? 3000);
