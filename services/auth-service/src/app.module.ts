import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { HealthController } from './health.controller.js';
import { User } from './user.entity.js';
import { AuthMail, PasswordReset } from './password-reset.entity.js';
import { AuthMailService } from './auth-mail.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.AUTH_DATABASE_URL ?? 'postgresql://fondue:fondue@localhost:5433/auth',
      entities: [User, AuthMail, PasswordReset],
      synchronize: true,
      // Keep retrying while PostgreSQL starts; Docker restarts the container if it never comes up.
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [HealthController, AuthController],
  providers: [AuthService, AuthMailService],
})
export class AppModule {}
