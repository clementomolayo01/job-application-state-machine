import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TechRole } from '@prisma/client';

export class CreateApplicationDto {
  @ApiProperty({
    enum: TechRole,
    description: 'The tech role being applied for',
  })
  @IsNotEmpty()
  @IsEnum(TechRole)
  roleApplied: TechRole;

  @ApiProperty({ description: 'The cover letter for the application' })
  @IsNotEmpty()
  @IsString()
  coverLetter: string;
}
