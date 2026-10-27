import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(private readonly database: DataSource) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'department-service' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.database.query('SELECT 1'),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Health query timed out')), 750); }),
      ]);
      return { status: 'ready', service: 'department-service', dependencies: { database: { status: 'up' } } };
    } catch {
      response.status(503);
      return { status: 'not_ready', service: 'department-service', dependencies: { database: { status: 'down' } } };
    } finally {
      clearTimeout(timer);
    }
  }
}
