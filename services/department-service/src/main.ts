import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { observeRequest } from './observability.js';

const app = await NestFactory.create(AppModule);
app.use(observeRequest);
app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
await app.listen(process.env.DEPARTMENT_PORT ?? 3001);
