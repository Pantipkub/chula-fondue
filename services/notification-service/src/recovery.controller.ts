import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { NotificationStore } from './notification-store.js';
import type { RecoveryEmail } from './email-template.js';

// Internal only: no gateway route exposes this endpoint or its recovery tokens.
@Controller('internal/password-reset')
export class RecoveryController {
  constructor(private readonly store: NotificationStore) {}
  @Post() @HttpCode(202)
  async accept(@Body() body: RecoveryEmail) {
    let url: URL;
    try { url = new URL(body.resetUrl); } catch { throw new BadRequestException('Invalid recovery URL'); }
    const origin = new URL(process.env.WEB_PUBLIC_URL ?? 'http://localhost:8080').origin;
    if (url.origin !== origin || url.pathname !== '/reset-password' || !/^[a-f0-9]{64}$/.test(url.searchParams.get('token') ?? '') ||
        !/^[a-f\d-]{36}$/i.test(body.eventId ?? '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipientEmail ?? '') ||
        !Number.isFinite(Date.parse(body.expiresAt))) throw new BadRequestException('Invalid recovery mail');
    await (await this.store.collection()).updateOne({ eventId: body.eventId }, { $setOnInsert: {
      eventId: body.eventId, recipientEmail: body.recipientEmail, resetUrl: body.resetUrl, expiresAt: body.expiresAt,
      kind: 'PASSWORD_RESET', receivedAt: new Date().toISOString(), purgeAt: new Date(body.expiresAt),
      delivery: process.env.EMAIL_MODE === 'gmail' ? 'PENDING' : 'RECORDED', attempts: 0, nextAttemptAt: new Date().toISOString(),
    } }, { upsert: true });
  }
}
