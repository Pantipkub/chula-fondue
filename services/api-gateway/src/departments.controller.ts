import { All, Controller, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';

const DEPARTMENT_SERVICE_URL = process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001';

// Forwards the same method and path to department-service and returns its status and body unchanged.
@Controller()
export class DepartmentsController {
  @All(['departments', 'departments/:id'])
  async proxy(@Req() req: Request, @Res() res: Response) {
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(DEPARTMENT_SERVICE_URL + req.originalUrl, {
        method: req.method,
        headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      });
    } catch {
      throw new ServiceUnavailableException('Department Service unreachable');
    }
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(upstream.status).send(await upstream.text());
  }
}
