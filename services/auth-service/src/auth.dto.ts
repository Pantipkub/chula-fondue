import { IsBoolean, IsEmail, IsIn, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

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

const ifSent = () => ValidateIf((_, value) => value !== undefined);
export class UpdateUserDto {
  @ifSent() @IsIn(['REPORTER', 'STAFF', 'ADMIN']) role?: 'REPORTER' | 'STAFF' | 'ADMIN';
  @ifSent() @IsUUID() departmentId?: string;
  @ifSent() @IsBoolean() active?: boolean;
}
export class ForgotPasswordDto {
  @IsEmail() email: string;
}
export class ResetPasswordDto {
  @IsString() @MinLength(64) @MaxLength(64) token: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}
export class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}
