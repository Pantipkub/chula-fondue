import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CreateUserDto, CredentialsDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

// API Gateway decides who may call each route; POST /auth/users is Admin-only there.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: CredentialsDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: CredentialsDto) {
    return this.auth.login(dto);
  }

  @Post('guest')
  @HttpCode(200)
  guest() {
    return this.auth.guest();
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.auth.createStaffOrAdmin(dto);
  }
}
