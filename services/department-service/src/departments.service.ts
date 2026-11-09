import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  findAll() {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string) {
    const department = await this.repo.findOneBy({ id });
    if (!department) throw new NotFoundException(`Department ${id} not found`);
    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const department = await this.findOne(id);
    if (dto.name !== undefined && dto.name !== department.name) await this.assertNameFree(dto.name);
    return this.repo.save(Object.assign(department, dto));
  }

  async remove(id: string) {
    await this.repo.manager.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('department-routing-rules'))");
      const department = await manager.findOne(Department, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!department) throw new NotFoundException(`Department ${id} not found`);
      if (await manager.existsBy(RoutingRule, { departmentId: id, enabled: true })) {
        throw new ConflictException('Disable or move active routing rules before deleting this department');
      }
      await manager.remove(department);
    });
  }

  private async assertNameFree(name: string) {
    if (await this.repo.existsBy({ name })) {
      throw new ConflictException(`Department name "${name}" already exists`);
    }
  }
}
