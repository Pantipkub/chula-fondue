import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './department.entity.js';
import { RoutingRule } from './routing-rule.entity.js';
import { canonicalCategory, CreateRoutingRuleDto, UpdateRoutingRuleDto } from './routing-rules.dto.js';

@Injectable()
export class RoutingRulesService {
  constructor(@InjectRepository(RoutingRule) private readonly rules: Repository<RoutingRule>) {}

  list() { return this.rules.find({ order: { category: 'ASC', createdAt: 'ASC' } }); }
  create(dto: CreateRoutingRuleDto) { return this.save(undefined, dto); }
  update(id: string, dto: UpdateRoutingRuleDto) { return this.save(id, dto); }

  private async save(id: string | undefined, dto: UpdateRoutingRuleDto) {
    try {
      return await this.rules.manager.transaction(async (manager) => {
        // Keep rule edits and department deletion in the same lock order, including FK cascades.
        await manager.query("SELECT pg_advisory_xact_lock(hashtext('department-routing-rules'))");
        const rule = id ? await manager.findOne(RoutingRule, { where: { id }, lock: { mode: 'pessimistic_write' } }) : manager.create(RoutingRule, { enabled: true });
        if (!rule) throw new NotFoundException('Routing rule not found');
        if (dto.category !== undefined) {
          const category = canonicalCategory(dto.category);
          if (!category) throw new BadRequestException('Unsupported routing category');
          rule.category = category;
        }
        if (dto.departmentId !== undefined) rule.departmentId = dto.departmentId;
        if (dto.enabled !== undefined) rule.enabled = dto.enabled;
        // Serialize against deletion of this department; the active-category index handles racing writers.
        if (!await manager.findOne(Department, { where: { id: rule.departmentId }, lock: { mode: 'pessimistic_write' } })) {
          throw new NotFoundException('Department not found');
        }
        return manager.save(rule);
      });
    } catch (error) {
      if ((error as { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('An enabled routing rule already exists for this category');
      }
      throw error;
    }
  }

  async match(value: string) {
    const category = canonicalCategory(value);
    if (!category) return { result: 'NO_RULE' as const };
    const rules = await this.rules.find({ where: { category, enabled: true }, relations: { department: true } });
    if (!rules.length) return { result: 'NO_RULE' as const };
    if (rules.length !== 1) return { result: 'AMBIGUOUS_RULES' as const };
    const { id: ruleId, department } = rules[0];
    return { result: 'MATCHED' as const, ruleId, category,
      department: { id: department.id, name: department.name, contactEmail: department.contactEmail } };
  }
}
