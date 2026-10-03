import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Field names match the camelCase form of proto/ticket.proto, so entities are returned as-is.
// Optional strings default to '' (the proto3 default) and timestamps are ISO strings.
@Entity()
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  category: string;

  @Column()
  location: string;

  @Column()
  description: string;

  @Column({ default: '' })
  photoUrl: string;

  @Column()
  reporterEmail: string;

  @Column()
  status: string;

  @Column({ default: '' })
  departmentId: string;

  @Column({ default: '' })
  departmentName: string;

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
