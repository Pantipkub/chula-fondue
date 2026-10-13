import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DEPARTMENT_DATABASE_URL ?? 'postgresql://fondue:fondue@localhost:5433/department',
      entities: [Department],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Department]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class AppModule {}
