import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DEPARTMENT_DATABASE_URL ?? 'postgresql://fondue:fondue@localhost:5433/department',
      entities: [Department],
      synchronize: true,
      // Keep retrying while PostgreSQL starts; Docker restarts the container if it never comes up.
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([Department]),
  ],
  controllers: [HealthController, DepartmentsController],
  providers: [DepartmentsService],
})
export class AppModule {}
