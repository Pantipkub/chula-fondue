import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AccountRole = 'REPORTER' | 'ADMIN' | 'STAFF';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  // scrypt output as "salt:hash"; the password itself is never stored.
  @Column()
  passwordHash: string;

  @Column()
  role: AccountRole;

  // Only STAFF accounts have a department.
  @Column({ default: '' })
  departmentId: string;

  @CreateDateColumn()
  createdAt: Date;
}
