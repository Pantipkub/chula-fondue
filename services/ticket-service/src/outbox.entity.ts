import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class OutboxEvent {
  @PrimaryColumn('uuid') id: string;
  @Column('jsonb') payload: Record<string, unknown>;
  @Column({ default: false }) notificationSent: boolean;
  @Column({ default: false }) analyticsSent: boolean;
  @Column() createdAt: string;
}
