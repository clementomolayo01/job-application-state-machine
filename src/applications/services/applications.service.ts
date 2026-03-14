import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { UpdateStatusDto } from '../dto/update-status.dto';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { ApplicationStatus, UserRole } from '@prisma/client';

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

    const application = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          userId,
          roleApplied: dto.roleApplied,
          coverLetter: dto.coverLetter,
          status: ApplicationStatus.APPLIED,
        },
        include: { user: true },
      });

      await tx.statusHistory.create({
        data: {
          applicationId: app.id,
          previousStatus: null,
          newStatus: ApplicationStatus.APPLIED,
          changedBy: userId,
        },
      });

      return app;
    });

    // Send email notifications asynchronously
    this.emailService
      .sendStatusChangeNotification(
        application.user.email,
        ApplicationStatus.APPLIED,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to send application creation email for app ${application.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      });

    return application;
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

    this.validateTransition(previousStatus, newStatus);

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
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to send status update email for app ${id}`,
          err instanceof Error ? err.stack : String(err),
        );
      });

    return updatedApplication;
  }

  async getHistory(id: string, user: { userId: string; role: string }) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    // Permission check
    if (user.role === UserRole.CANDIDATE && app.userId !== user.userId) {
      throw new ForbiddenException(
        'You are not authorized to view this application history',
      );
    }

    return this.prisma.statusHistory.findMany({
      where: { applicationId: id },
      orderBy: { timestamp: 'asc' },
    });
  }

  validateTransition(
    currentStatus: ApplicationStatus,
    nextStatus: ApplicationStatus,
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
    ) {
      return;
    }
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
