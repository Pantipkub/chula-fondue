import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, Roles } from './auth.js';
import { proxyRest } from './rest-proxy.js';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';

@Controller('auth')
export class AuthController {
  @Post(['register', 'login', 'guest'])
  @Public()
  open(@Req() req: Request, @Res() res: Response) {
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }

  // Creates Admin and Department Staff accounts.
  @Post('users')
  @Roles('ADMIN')
  createUser(@Req() req: Request, @Res() res: Response) {
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }
}
