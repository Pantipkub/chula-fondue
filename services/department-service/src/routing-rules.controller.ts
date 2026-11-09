import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CreateRoutingRuleDto, MatchRoutingRuleDto, UpdateRoutingRuleDto } from './routing-rules.dto.js';
import { RoutingRulesService } from './routing-rules.service.js';

@Controller('routing-rules')
export class RoutingRulesController {
  constructor(private readonly rules: RoutingRulesService) {}
  @Get() list() { return this.rules.list(); }
  @Post() create(@Body() dto: CreateRoutingRuleDto) { return this.rules.create(dto); }
  @Post('match') @HttpCode(200) match(@Body() dto: MatchRoutingRuleDto) { return this.rules.match(dto.category); }
  @Put(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoutingRuleDto) { return this.rules.update(id, dto); }
}
