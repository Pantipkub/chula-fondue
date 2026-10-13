import { IsEmail, IsIn, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CredentialsDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

// Accounts an Admin creates for other Admins and for Department Staff.
export class CreateUserDto extends CredentialsDto {
  @IsIn(['ADMIN', 'STAFF'])
  role: 'ADMIN' | 'STAFF';

  @ValidateIf((dto: CreateUserDto) => dto.role === 'STAFF')
  @IsUUID()
  departmentId?: string;
}
