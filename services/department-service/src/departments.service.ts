import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDepartmentDto, UpdateDepartmentDto } from './department.dto.js';
import { Department } from './department.entity.js';
import { RoutingRule } from './routing-rule.entity.js';

@Injectable()
export class DepartmentsService {
  constructor(@InjectRepository(Department) private readonly repo: Repository<Department>) {}

  async create(dto: CreateDepartmentDto) {
    await this.assertNameFree(dto.name);
    return this.repo.save({ ...dto, buildings: dto.buildings ?? [] });
  }

  findAll(includeInactive = false) {
    return this.repo.find({ where: includeInactive ? {} : { active: true }, order: { createdAt: 'ASC' } });
  }

  async findOne(id: string, includeInactive = false) {
    const department = await this.repo.findOneBy({ id, ...(!includeInactive && { active: true }) });
    if (!department) throw new NotFoundException(`Department ${id} not found`);
    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    return this.repo.manager.transaction(async manager => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('department-routing-rules'))");
      const department = await manager.findOne(Department, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!department) throw new NotFoundException('Department not found');
      if (dto.name !== undefined && dto.name !== department.name) await this.assertNameFree(dto.name);
      if (dto.active === false && department.active) {
        if (await manager.existsBy(RoutingRule, { departmentId: id, enabled: true })) throw new ConflictException('Disable or move active routing rules before deleting this department');
        await this.assertUnused(id);
      }
      return manager.save(Object.assign(department, dto));
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Retain the identity for historical tickets/accounts; never cascade-delete their department.
    await this.update(id, { active: false });
  }

  private async assertUnused(id: string) {
    const read = async (url: string): Promise<Record<string, number>> => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error('upstream');
        const data = await response.json() as Record<string, number>;
        if (Object.values(data).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('invalid usage');
        return data;
      } catch { throw new ServiceUnavailableException('Cannot verify department usage; try again shortly'); }
    };
    const [accounts, tickets] = await Promise.all([
      read(`${process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002'}/auth/department-usage/${id}`),
      read(`${process.env.TICKET_SERVICE_HTTP_URL ?? 'http://localhost:8081'}/internal/departments/${id}/usage`),
    ]);
    if (accounts.staff === undefined || tickets.open === undefined) throw new ServiceUnavailableException('Cannot verify department usage');
    if (accounts.staff) throw new ConflictException('Department still has active staff; move or disable accounts first');
    if (tickets.open) throw new ConflictException('Department still has open tickets; move or complete work first');
  }

  private async assertNameFree(name: string) {
    if (await this.repo.existsBy({ name })) {
      throw new ConflictException(`Department name "${name}" already exists`);
    }
  }
}
