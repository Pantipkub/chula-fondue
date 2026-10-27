import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { UPLOADS_DIR } from './photo-storage.js';
import { requestContext } from './request-context.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.use(requestContext);
// Only used by the local photo fallback; with CLOUDINARY_URL set, photo links point at Cloudinary.
app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads' });
// Lets `docker compose stop` finish open requests instead of cutting them.
app.enableShutdownHooks();
await app.listen(process.env.GATEWAY_PORT ?? 3000);
