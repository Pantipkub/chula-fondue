import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Ticket } from './ticket.entity.js';

// Internal Compose network only; there is no public gateway route for this endpoint.
@Controller('internal/departments')
export class DepartmentUsageController {
  constructor(private readonly db: DataSource) {}
  @Get(':id/usage')
  async usage(@Param('id', ParseUUIDPipe) departmentId: string) {
    return { open: await this.db.getRepository(Ticket).countBy({ departmentId, status: In(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED']) }) };
  }
}
