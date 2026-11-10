import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ChangePasswordDto, CreateUserDto, CredentialsDto, ForgotPasswordDto, ResetPasswordDto, UpdateUserDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

// API Gateway decides who may call each route; POST /auth/users is Admin-only there.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('users')
  users() { return this.auth.listUsers(); }

  @Put('users/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Headers('x-user-id') actorId: string) { return this.auth.updateUser(id, dto, actorId); }

  @Get('department-usage/:id')
  usage(@Param('id', ParseUUIDPipe) id: string) { return this.auth.departmentUsage(id); }

  @Post('session') @HttpCode(200)
  session(@Body('token') token: string) { return this.auth.session(token); }

  @Post('password') @HttpCode(200)
  changePassword(@Headers('x-user-id') id: string, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(id, dto); }

  @Post('logout') @HttpCode(200)
  logout(@Headers('x-user-id') id: string) { return this.auth.logout(id); }

  @Post('forgot-password') @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto.email); }

  @Post('reset-password') @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto); }

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
