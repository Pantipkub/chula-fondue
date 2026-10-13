import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (see .env.example)');
}

export type Role = 'REPORTER' | 'ADMIN' | 'STAFF' | 'GUEST';

// The claims Auth Service puts in the token.
export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
  departmentId: string;
}

/** Route needs no token. */
export const Public = () => SetMetadata('public', true);
/** Route needs a token with one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
/** The verified token claims of the caller. */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

// Global guard: every route needs a valid token unless it is marked @Public().
// This is the only place tokens are checked; the services behind the gateway trust it.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');
    let user: AuthUser;
    try {
      user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException(`This action requires role ${roles.join(' or ')}`);
    }
    return true;
  }
}
