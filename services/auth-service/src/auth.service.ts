import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ConflictException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { CreateUserDto, CredentialsDto } from './auth.dto.js';
import { AccountRole, User } from './user.entity.js';

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
const signToken = (claims: { sub: string; email: string; role: AccountRole | 'GUEST'; departmentId: string }) =>
  jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1d' });

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const publicUser = ({ id, email, role, departmentId }: User) => ({ id, email, role, departmentId });

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

  createStaffOrAdmin(dto: CreateUserDto) {
    return this.createUser(dto.email, dto.password, dto.role, dto.role === 'STAFF' ? dto.departmentId! : '');
  }

  // ponytail: no login rate limit; add a throttler before this faces the public internet.
  async login(dto: CredentialsDto) {
    const user = await this.users.findOneBy({ email: normalizeEmail(dto.email) });
    // Same answer for an unknown email and a wrong password.
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = signToken({ sub: user.id, email: user.email, role: user.role, departmentId: user.departmentId });
    return { accessToken, user: publicUser(user) };
  }

  // Guests have no account: the token only says "anonymous reporter".
  guest() {
    return { accessToken: signToken({ sub: `guest-${randomUUID()}`, email: '', role: 'GUEST', departmentId: '' }) };
  }

  private async createUser(rawEmail: string, password: string, role: AccountRole, departmentId: string) {
    const email = normalizeEmail(rawEmail);
    if (await this.users.existsBy({ email })) throw new ConflictException(`Email ${email} is already registered`);
    const user = await this.users.save({ email, passwordHash: await hashPassword(password), role, departmentId });
    return publicUser(user);
  }
}
