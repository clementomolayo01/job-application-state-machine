import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApplicationStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStatusDto {
  @ApiProperty({
    enum: ApplicationStatus,
    description: 'The new status of the application',
  })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @ApiProperty({
    description: 'The URL of the contract, required when status is CONTRACTED',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  contractUrl?: string;
}
