import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { ChangePasswordDto, CreateUserDto, CredentialsDto, ResetPasswordDto, UpdateUserDto } from './auth.dto.js';
import { AccountRole, User } from './user.entity.js';
import { AuthMail, PasswordReset } from './password-reset.entity.js';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (see .env.example)');
}

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keyLength: number) => Promise<Buffer>;

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(password, salt, 64)).toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// The token payload API Gateway reads: who the caller is, their role and (for STAFF) their department.
const signToken = (claims: { sub: string; email: string; role: AccountRole | 'GUEST'; departmentId: string; tokenVersion?: number }) =>
  jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: claims.role === 'GUEST' ? '30d' : '1d' });

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const publicUser = ({ id, email, role, departmentId, active }: User) => ({ id, email, role, departmentId, active });
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const accountLock = (manager: Repository<User>['manager']) => manager.query("SELECT pg_advisory_xact_lock(hashtext('auth-accounts'))");

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('AuthService');

  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  // The first Admin cannot be created through the API, so it comes from the environment.
  async onModuleInit() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: no Admin account was seeded');
      return;
    }
    if (await this.users.existsBy({ email: normalizeEmail(ADMIN_EMAIL) })) return;
    await this.createUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'ADMIN', '');
    this.logger.log(`Seeded Admin account ${normalizeEmail(ADMIN_EMAIL)}`);
  }

  register(dto: CredentialsDto) {
    return this.createUser(dto.email, dto.password, 'REPORTER', '');
  }

  async listUsers() {
    return (await this.users.find({ order: { email: 'ASC' } })).map(publicUser);
  }

  createStaffOrAdmin(dto: CreateUserDto) {
    return this.createUser(dto.email, dto.password, dto.role, dto.role === 'STAFF' ? dto.departmentId! : '');
  }

  async login(dto: CredentialsDto) {
    const user = await this.users.findOneBy({ email: normalizeEmail(dto.email) });
    // Same answer for an unknown email and a wrong password.
    if (!user || !user.active || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = signToken({ sub: user.id, email: user.email, role: user.role, departmentId: user.departmentId, tokenVersion: user.tokenVersion });
    return { accessToken, user: publicUser(user) };
  }

  // Guests have no account: the token only says "anonymous reporter".
  guest() {
    return { accessToken: signToken({ sub: `guest-${randomUUID()}`, email: '', role: 'GUEST', departmentId: '' }) };
  }

  async session(token: string) {
    let claims: { sub: string; tokenVersion?: number; role: string; departmentId: string };
    try { claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as typeof claims; }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
    const user = await this.users.findOneBy({ id: claims.sub });
    if (!user?.active || user.tokenVersion !== (claims.tokenVersion ?? 0) || user.role !== claims.role || user.departmentId !== claims.departmentId) {
      throw new UnauthorizedException('Session revoked; please sign in again');
    }
    return { sub: user.id, email: user.email, role: user.role, departmentId: user.departmentId };
  }

  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    return this.users.manager.transaction(async manager => {
      await accountLock(manager);
      const user = await manager.findOneBy(User, { id });
      if (!user) throw new NotFoundException('User not found');
      const role = dto.role ?? user.role;
      const active = dto.active ?? user.active;
      if (id === actorId && !active) throw new ConflictException('Cannot disable your own account');
      if (user.role === 'ADMIN' && user.active && (role !== 'ADMIN' || !active) && await manager.countBy(User, { role: 'ADMIN', active: true }) <= 1) {
        throw new ConflictException('Cannot remove the last active admin');
      }
      const departmentId = role === 'STAFF' ? dto.departmentId ?? user.departmentId : '';
      if (role === 'STAFF' && active) await this.validateDepartment(departmentId);
      if (role !== user.role || active !== user.active || departmentId !== user.departmentId) user.tokenVersion++;
      Object.assign(user, { role, active, departmentId });
      return publicUser(await manager.save(user));
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    await this.users.manager.transaction(async manager => {
      await accountLock(manager);
      const user = await manager.findOneBy(User, { id });
      if (!user?.active || !await verifyPassword(dto.currentPassword, user.passwordHash)) throw new UnauthorizedException('Current password is incorrect');
      user.passwordHash = await hashPassword(dto.password); user.tokenVersion++;
      await manager.save(user);
      await manager.delete(PasswordReset, { userId: id });
      await manager.delete(AuthMail, { userId: id });
    });
    return { message: 'Password changed; please sign in again' };
  }

  async logout(id: string) {
    await this.users.manager.transaction(async manager => {
      await accountLock(manager);
      await manager.increment(User, { id }, 'tokenVersion', 1);
    });
    return { message: 'Signed out' };
  }

  async forgotPassword(email: string) {
    await this.users.manager.transaction(async manager => {
      await accountLock(manager);
      const user = await manager.findOneBy(User, { email: normalizeEmail(email), active: true });
      if (!user) return;
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
      const resetUrl = new URL('/reset-password', process.env.WEB_PUBLIC_URL ?? 'http://localhost:8080');
      resetUrl.searchParams.set('token', token);
      await manager.delete(PasswordReset, { userId: user.id });
      await manager.delete(AuthMail, { userId: user.id });
      await manager.save(PasswordReset, { tokenHash: digest(token), userId: user.id, tokenVersion: user.tokenVersion, expiresAt });
      await manager.save(AuthMail, { eventId: randomUUID(), userId: user.id, recipientEmail: user.email, resetUrl: resetUrl.toString(), expiresAt, attempts: 0, nextAttemptAt: new Date().toISOString() });
    });
    // Never reveal whether this email has an account; the reset token is sent only by mail.
    return { message: 'If an active account exists, a password reset link will be sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    await this.users.manager.transaction(async manager => {
      await accountLock(manager);
      const reset = await manager.findOneBy(PasswordReset, { tokenHash: digest(dto.token) });
      const user = reset && await manager.findOneBy(User, { id: reset.userId });
      if (!reset || !user?.active || reset.expiresAt <= new Date().toISOString() || reset.tokenVersion !== user.tokenVersion) throw new BadRequestException('Reset link is invalid or expired');
      user.passwordHash = await hashPassword(dto.password); user.tokenVersion++;
      await manager.save(user);
      await manager.delete(PasswordReset, { userId: user.id });
      await manager.delete(AuthMail, { userId: user.id });
    });
    return { message: 'Password reset; please sign in again' };
  }

  async departmentUsage(departmentId: string) {
    return { staff: await this.users.countBy({ departmentId, role: 'STAFF', active: true }), total: await this.users.countBy({ departmentId, role: 'STAFF' }) };
  }

  private async validateDepartment(id: string) {
    if (!id || !/^[a-f\d-]{36}$/i.test(id)) throw new BadRequestException('departmentId must be a UUID');
    let response: Response;
    try { response = await fetch(`${process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001'}/departments/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(3000) }); }
    catch { throw new ServiceUnavailableException('Department Service unavailable'); }
    if (response.status === 404) throw new BadRequestException('Department does not exist or is inactive');
    if (!response.ok) throw new ServiceUnavailableException('Department Service unavailable');
  }

  private async createUser(rawEmail: string, password: string, role: AccountRole, departmentId: string) {
    if (role === 'STAFF') await this.validateDepartment(departmentId);
    const email = normalizeEmail(rawEmail);
    if (await this.users.existsBy({ email })) throw new ConflictException(`Email ${email} is already registered`);
    let user: User;
    try { user = await this.users.save({ email, passwordHash: await hashPassword(password), role, departmentId, active: true, tokenVersion: 0 }); }
    catch (error) { if ((error as { driverError?: { code?: string } }).driverError?.code === '23505') throw new ConflictException('Email is already registered'); throw error; }
    return publicUser(user);
  }
}
