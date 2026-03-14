/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { ApplicationStatus, TechRole } from '@prisma/client';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: PrismaService;
  let emailService: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: PrismaService,
          useValue: {
            application: {
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            statusHistory: { create: jest.fn(), findMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: { sendStatusChangeNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    prisma = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an application and send an email', async () => {
      const mockApp = {
        id: 'uuid',
        userId: 'user1',
        roleApplied: 'BACKEND_ENGINEER',
        user: { email: 'test@test.com' },
      };

      jest.spyOn(prisma.application, 'findUnique').mockResolvedValue(null);
      jest
        .spyOn(prisma.application, 'create')
        .mockResolvedValue(mockApp as any);

      const transactionMock = jest
        .fn()
        .mockImplementation((cb: (tx: PrismaService) => Promise<any>) => {
          return cb(prisma);
        });
      jest.spyOn(prisma, '$transaction').mockImplementation(transactionMock);

      const emailSpy = jest
        .spyOn(emailService, 'sendStatusChangeNotification')
        .mockResolvedValue(undefined);

      const dto = {
        roleApplied: TechRole.BACKEND_ENGINEER,
        coverLetter: 'Hello',
      };

      await service.create(dto, 'user1');

      expect(transactionMock).toHaveBeenCalled();
      expect(emailSpy).toHaveBeenCalledWith(
        'test@test.com',
        ApplicationStatus.APPLIED,
      );
    });
  });

  describe('validateTransition', () => {
    it('should throw error if APPLIED -> CONTRACTED (invalid jump)', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.APPLIED,
          ApplicationStatus.CONTRACTED,
        );
      }).toThrow(BadRequestException);
    });

    it('should allow APPLIED -> INTERVIEWING', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.APPLIED,
          ApplicationStatus.INTERVIEWING,
        );
      }).not.toThrow();
    });

    it('should allow INTERVIEWING -> CONTRACTED without contractUrl', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.INTERVIEWING,
          ApplicationStatus.CONTRACTED,
        );
      }).not.toThrow();
    });

    it('should allow INTERVIEWING -> CONTRACTED with contractUrl', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.INTERVIEWING,
          ApplicationStatus.CONTRACTED,
        );
      }).not.toThrow();
    });

    it('should always allow transitioning to CLOSED', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.APPLIED,
          ApplicationStatus.CLOSED,
        );
      }).not.toThrow();
    });
  });

  describe('updateStatus', () => {
    it('should throw NotFoundException if app does not exist', async () => {
      jest.spyOn(prisma.application, 'findUnique').mockResolvedValue(null);
      await expect(
        service.updateStatus(
          'uuid',
          { status: ApplicationStatus.INTERVIEWING },
          'user1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should perform atomic transaction and send email on CONTRACTED', async () => {
      const mockApp = {
        id: 'uuid',
        status: ApplicationStatus.INTERVIEWING,
        user: { email: 'test@test.com' },
      };
      jest
        .spyOn(prisma.application, 'findUnique')
        .mockResolvedValue(mockApp as any);

      const transactionMock = jest
        .fn()
        .mockImplementation((cb: (tx: PrismaService) => Promise<any>) => {
          return cb(prisma);
        });
      jest.spyOn(prisma, '$transaction').mockImplementation(transactionMock);

      const emailSpy = jest
        .spyOn(emailService, 'sendStatusChangeNotification')
        .mockResolvedValue(undefined);

      await service.updateStatus(
        'uuid',
        {
          status: ApplicationStatus.CONTRACTED,
        },
        'user1',
      );

      expect(transactionMock).toHaveBeenCalled();
      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: 'uuid' },
        data: { status: ApplicationStatus.CONTRACTED },
      });
      expect(prisma.statusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'uuid',
          previousStatus: ApplicationStatus.INTERVIEWING,
          newStatus: ApplicationStatus.CONTRACTED,
          changedBy: 'user1',
        },
      });
      expect(emailSpy).toHaveBeenCalledWith(
        'test@test.com',
        ApplicationStatus.CONTRACTED,
      );
    });
  });

  describe('getHistory', () => {
    it('should return history', async () => {
      const mockApp = { id: 'uuid', userId: 'user1' };
      jest
        .spyOn(prisma.application, 'findUnique')
        .mockResolvedValue(mockApp as any);

      const historyResult = [{ id: 'hist1' }];
      jest
        .spyOn(prisma.statusHistory, 'findMany')
        .mockResolvedValue(historyResult as any);

      const res = await service.getHistory('uuid', {
        userId: 'user1',
        role: 'ADMIN',
      });
      expect(res).toEqual(historyResult);
      expect(prisma.statusHistory.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'uuid' },
        orderBy: { timestamp: 'asc' },
      });
    });

    it('should throw ForbiddenException if candidate tries to access another user app history', async () => {
      const mockApp = { id: 'uuid', userId: 'other-user' };
      jest
        .spyOn(prisma.application, 'findUnique')
        .mockResolvedValue(mockApp as any);

      await expect(
        service.getHistory('uuid', { userId: 'user1', role: 'CANDIDATE' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
