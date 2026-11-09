import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { HealthController } from './health.controller.js';
import { RoutingRule } from './routing-rule.entity.js';
import { RoutingRulesController } from './routing-rules.controller.js';
import { RoutingRulesService } from './routing-rules.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DEPARTMENT_DATABASE_URL ?? 'postgresql://fondue:fondue@localhost:5433/department',
      entities: [Department, RoutingRule],
      synchronize: true,
      // Keep retrying while PostgreSQL starts; Docker restarts the container if it never comes up.
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([Department, RoutingRule]),
  ],
  controllers: [HealthController, DepartmentsController, RoutingRulesController],
  providers: [DepartmentsService, RoutingRulesService],
})
export class AppModule {}
