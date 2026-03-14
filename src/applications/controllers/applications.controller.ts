import {
  Controller,
  Patch,
  Param,
  Body,
  Get,
  UseGuards,
  Req,
  Post,
  Request,
} from '@nestjs/common';
import { ApplicationsService } from '../services/applications.service';
import { UpdateStatusDto } from '../dto/update-status.dto';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

@ApiTags('applications')
@ApiBearerAuth()
@Controller('api/applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: 'Create a new job application' })
  @ApiResponse({
    status: 201,
    description: 'The application has been successfully created.',
  })
  create(
    @Body() createApplicationDto: CreateApplicationDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.userId;
    return this.applicationsService.create(createApplicationDto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'Get all job applications' })
  @ApiResponse({ status: 200, description: 'Returns all applications.' })
  findAll() {
    return this.applicationsService.findAll();
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.COMPANY)
  @ApiOperation({ summary: 'Update application status' })
  @ApiResponse({
    status: 200,
    description: 'The application status has been successfully updated.',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.userId;
    return this.applicationsService.updateStatus(id, updateStatusDto, userId);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get application status history' })
  @ApiHeader({
    name: 'x-user-role',
    required: true,
    description: 'Role of the user (ADMIN, COMPANY, CANDIDATE)',
  })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'ID of the user',
  })
  @ApiResponse({ status: 200, description: 'Returns the status history.' })
  getHistory(@Param('id') id: string) {
    return this.applicationsService.getHistory(id);
  }
}
