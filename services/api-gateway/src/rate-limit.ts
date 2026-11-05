import { HttpException } from '@nestjs/common';
// Bounded in-memory limit for the single-gateway Compose deployment.
export class AuthRateLimit {
  private readonly attempts = new Map<string, { count: number; expires: number }>();
  check(key: string, now = Date.now()) {
    for (const [ip, record] of this.attempts) if (record.expires <= now) this.attempts.delete(ip);
    const max = Number(process.env.AUTH_RATE_LIMIT ?? 30);
    const record = this.attempts.get(key) ?? { count: 0, expires: now + 60000 };
    if (++record.count > max) throw new HttpException('Too many authentication attempts. Retry in one minute.', 429);
    if (this.attempts.size > 10000 && !this.attempts.has(key)) throw new HttpException('Please retry later', 429);
    this.attempts.set(key, record);
  }
}
