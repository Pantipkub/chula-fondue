import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { HealthController } from './health.controller.js';

const database = process.env.DEPARTMENT_DB_PATH ?? join(import.meta.dirname, '..', 'department.sqlite');
mkdirSync(dirname(database), { recursive: true });

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database,
      entities: [Department],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Department]),
  ],
  controllers: [DepartmentsController, HealthController],
  providers: [DepartmentsService],
})
export class AppModule {}
