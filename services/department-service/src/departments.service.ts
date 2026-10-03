import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDepartmentDto, UpdateDepartmentDto } from './department.dto.js';
import { Department } from './department.entity.js';

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
    await this.repo.remove(await this.findOne(id));
  }

  private async assertNameFree(name: string) {
    if (await this.repo.existsBy({ name })) {
      throw new ConflictException(`Department name "${name}" already exists`);
    }
  }
}
