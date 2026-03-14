import { IsEnum } from 'class-validator';
import { ApplicationStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStatusDto {
  @ApiProperty({ enum: ApplicationStatus, description: 'The new status of the application' })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;
}
