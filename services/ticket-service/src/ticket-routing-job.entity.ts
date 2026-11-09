import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Ticket } from './ticket.entity.js';

export const autoRoutingEnabled = () => process.env.AUTO_ROUTING_ENABLED === 'true';
export type RoutingState = 'PENDING' | 'PROCESSING' | 'RETRY' | 'REVIEW' | 'DONE' | 'STOPPED';

@Entity()
@Index(['state', 'nextAttemptAt'])
export class TicketRoutingJob {
  @PrimaryColumn('uuid') ticketId: string;
  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' }) ticket: Ticket;
  @Column({ default: 'PENDING' }) state: RoutingState;
  @Column({ default: 0 }) attempts: number;
  @Column({ default: '' }) nextAttemptAt: string;
  @Column({ default: '' }) lastReason: string;
  @Column({ default: '' }) leaseUntil: string;
  @Column({ default: '' }) leaseToken: string;
  @Column({ default: '' }) requestId: string;
  @Column() createdAt: string;
  @Column() updatedAt: string;
}
