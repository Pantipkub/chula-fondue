import { IsBoolean, IsNotEmpty, IsString, IsUUID, ValidateIf } from 'class-validator';

export const ROUTABLE_CATEGORIES = ['Electrical', 'Plumbing', 'Air conditioning', 'IT / Network', 'Building'] as const;
export function canonicalCategory(value: string) {
  return ROUTABLE_CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
}

export class CreateRoutingRuleDto {
  @IsString() @IsNotEmpty() category: string;
  @IsUUID() departmentId: string;
  @ValidateIf((_, value) => value !== undefined) @IsBoolean() enabled?: boolean;
}
export class UpdateRoutingRuleDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() @IsNotEmpty() category?: string;
  @ValidateIf((_, value) => value !== undefined) @IsUUID() departmentId?: string;
  @ValidateIf((_, value) => value !== undefined) @IsBoolean() enabled?: boolean;
}
export class MatchRoutingRuleDto {
  @IsString() @IsNotEmpty() category: string;
}
