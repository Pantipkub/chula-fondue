import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Public fields match the camelCase form of proto/ticket.proto; the response mapper omits internal contact data.
// Optional strings default to '' (the proto3 default) and timestamps are ISO strings.
@Entity()
@Index('ticket_submission_key', ['reporterId', 'submissionKey'], { unique: true, where: '"submissionKey" <> \'\'' })
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  category: string;

  @Column()
  location: string;

  @Column()
  description: string;

  @Column('text', { array: true, default: () => "'{}'" })
  photoUrls: string[];

  @Column('text', { array: true, default: () => "'{}'" })
  completionPhotoUrls: string[];

  @Column()
  reporterEmail: string;

  @Column({ default: '' })
  reporterId: string;

  @Column({ default: '' }) submissionKey: string;
  @Column({ default: '' }) submissionFingerprint: string;

  @Column({ default: 0 })
  version: number;

  @Column({ default: '' })
  resolvedAt: string;

  @Column({ default: '' })
  closedAt: string;

  @Column()
  status: string;

  @Column({ default: '' })
  departmentId: string;

  @Column({ default: '' })
  departmentName: string;

  @Column({ default: '' }) assignmentSource: string;
  @Column({ default: '' }) routingRuleId: string;
  @Column({ default: '' }) departmentContactEmail: string;

  @Column({ default: '' })
  reason: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}

@Entity()
export class TicketHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticketId: string;

  @Column()
  fromStatus: string;

  @Column()
  toStatus: string;

  @Column()
  note: string;

  @Column()
  changedAt: string;
}
