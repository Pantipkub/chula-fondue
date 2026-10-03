import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buildings?: string[];
}

// Every field may be omitted, but a field that is sent (even as null) must be valid.
const ifSent = () => ValidateIf((_, value) => value !== undefined);

export class UpdateDepartmentDto {
  @ifSent()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ifSent()
  @IsEmail()
  contactEmail?: string;

  @ifSent()
  @IsArray()
  @IsString({ each: true })
  buildings?: string[];
}
