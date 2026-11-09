import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Department } from './department.entity.js';

@Entity()
@Index('routing_rule_active_category', ['category'], { unique: true, where: '"enabled" = true' })
export class RoutingRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() category: string;
  @Column('uuid') departmentId: string;
  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'departmentId' }) department: Department;
  @Column({ default: true }) enabled: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
