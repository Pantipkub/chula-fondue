import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(import.meta.dirname, '..', 'department.sqlite'),
      entities: [Department],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Department]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class AppModule {}
