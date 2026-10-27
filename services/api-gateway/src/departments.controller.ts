import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DepartmentClient } from './department.client.js';

// Forwards the same method and path to department-service and returns its status and body unchanged.
@Controller()
export class DepartmentsController {
  constructor(private readonly departments: DepartmentClient) {}

  @All(['departments', 'departments/:id'])
  async proxy(@Req() req: Request, @Res() res: Response) {
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
    const upstream = await this.departments.request(req.originalUrl, {
      method: req.method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
    if (upstream.contentType) res.setHeader('Content-Type', upstream.contentType);
    res.status(upstream.status).send(upstream.text);
  }
}
