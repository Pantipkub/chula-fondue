import { AuthRateLimit } from './rate-limit.js';
import { Controller, Get, Post, Put, Req, Res, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, Public, Roles } from './auth.js';
import type { AuthUser } from './auth.js';
import { proxyRest } from './rest-proxy.js';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';

@Controller('auth')
export class AuthController {
  private readonly limiter = new AuthRateLimit();
  @Get('me')
  me(@CurrentUser() user: AuthUser) { return user; }

  @Get('users')
  @Roles('ADMIN')
  users(@Req() req: Request, @Res() res: Response) {
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }
  @Post(['register', 'login', 'guest', 'forgot-password', 'reset-password'])
  @Public()
  open(@Req() req: Request, @Res() res: Response) {
    this.limiter.check(req.ip ?? 'unknown');
    if (req.path.endsWith('forgot-password')) this.limiter.check(`recovery:${String(req.body?.email ?? '').trim().toLowerCase()}`);
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }

  @Put('users/:id') @Roles('ADMIN')
  updateUser(@Req() req: Request, @Res() res: Response) {
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }

  @Post(['password', 'logout']) @Roles('ADMIN', 'STAFF', 'REPORTER')
  account(@Req() req: Request, @Res() res: Response) {
    this.limiter.check(req.ip ?? 'unknown');
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }

  // Creates Admin and Department Staff accounts.
  @Post('users')
  @Roles('ADMIN')
  async createUser(@Req() req: Request, @Res() res: Response) {
    if (req.body?.role === 'STAFF') {
      const id = req.body.departmentId;
      if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) throw new BadRequestException('departmentId must be a UUID');
      let response: globalThis.Response;
      try { response = await fetch(`${process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001'}/departments/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) }); }
      catch { throw new ServiceUnavailableException('Department Service unavailable'); }
      if (response.status === 404 || response.status === 400) throw new BadRequestException('Department does not exist');
      if (!response.ok) throw new ServiceUnavailableException('Department Service unavailable');
    }
    this.limiter.check(req.ip ?? 'unknown');
    return proxyRest('Auth Service', AUTH_SERVICE_URL, req, res);
  }
}
