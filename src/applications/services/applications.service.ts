import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { UpdateStatusDto } from '../dto/update-status.dto';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { ApplicationStatus } from '@prisma/client';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async create(dto: CreateApplicationDto, userId: string) {
    const existing = await this.prisma.application.findUnique({
      where: {
        userId_roleApplied: {
          userId,
          roleApplied: dto.roleApplied,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `You have already applied for the ${dto.roleApplied} role.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          userId,
          roleApplied: dto.roleApplied,
          coverLetter: dto.coverLetter,
          status: ApplicationStatus.APPLIED,
        },
      });

      await tx.statusHistory.create({
        data: {
          applicationId: application.id,
          previousStatus: null,
          newStatus: ApplicationStatus.APPLIED,
          changedBy: userId,
        },
      });

      return application;
    });
  }

  async findAll() {
    return this.prisma.application.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, dto: UpdateStatusDto, changedBy: string) {
    const { status: newStatus } = dto;

    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    const previousStatus = application.status;

    this.validateTransition(previousStatus, newStatus, dto);

    const updatedApplication = await this.prisma.$transaction(async (tx) => {
      const updatedApp = await tx.application.update({
        where: { id },
        data: {
          status: newStatus,
        },
      });

      await tx.statusHistory.create({
        data: {
          applicationId: id,
          previousStatus,
          newStatus,
          changedBy,
        },
      });

      return updatedApp;
    });

    // Send email notifications asynchronously
    this.emailService
      .sendStatusChangeNotification(application.user.email, newStatus)
      .catch((err) => {
        this.logger.error(
          `Failed to send status update email for app ${id}`,
          err,
        );
      });

    return updatedApplication;
  }

  async getHistory(id: string) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    return this.prisma.statusHistory.findMany({
      where: { applicationId: id },
      orderBy: { timestamp: 'asc' },
    });
  }

  validateTransition(
    currentStatus: ApplicationStatus,
    nextStatus: ApplicationStatus,
    dto: UpdateStatusDto,
  ) {
    if (nextStatus === ApplicationStatus.CLOSED) {
      return;
    }

    if (
      currentStatus === ApplicationStatus.APPLIED &&
      nextStatus === ApplicationStatus.INTERVIEWING
    )
      return;
    if (
      currentStatus === ApplicationStatus.INTERVIEWING &&
      nextStatus === ApplicationStatus.CONTRACTED
    )
      return;
    if (
      currentStatus === ApplicationStatus.CONTRACTED &&
      nextStatus === ApplicationStatus.COMPLETED
    )
      return;

    throw new BadRequestException(
      `Invalid transition from ${currentStatus} to ${nextStatus}`,
    );
  }
}
