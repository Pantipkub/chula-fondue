import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from './auth.js';
import { proxyRest } from './rest-proxy.js';

const DEPARTMENT_SERVICE_URL = process.env.DEPARTMENT_SERVICE_URL ?? 'http://localhost:3001';

@Controller()
export class DepartmentsController {
  @All(['departments', 'departments/:id'])
  @Roles('ADMIN')
  proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRest('Department Service', DEPARTMENT_SERVICE_URL, req, res);
  }
}
