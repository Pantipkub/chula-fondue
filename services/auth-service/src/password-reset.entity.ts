import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('password_resets')
export class PasswordReset {
  @PrimaryColumn() tokenHash: string;
  @Column('uuid') userId: string;
  @Column() tokenVersion: number;
  @Column() expiresAt: string;
}

// Durable delivery of recovery mail; removed after acceptance by Notification Service.
@Entity('auth_mail_outbox')
export class AuthMail {
  @PrimaryColumn('uuid') eventId: string;
  @Column('uuid') userId: string;
  @Column() recipientEmail: string;
  @Column() resetUrl: string;
  @Column() expiresAt: string;
  @Column({ default: 0 }) attempts: number;
  @Column() nextAttemptAt: string;
}
