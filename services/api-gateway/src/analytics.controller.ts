import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from './auth.js';
import { proxyRest } from './rest-proxy.js';
@Controller()
export class AnalyticsController {
  @All('analytics')
  @Roles('ADMIN')
  report(@Req() req: Request, @Res() res: Response) {
    return proxyRest('Analytics Service', process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3003', req, res);
  }
}
