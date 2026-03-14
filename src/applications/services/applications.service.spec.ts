import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { ApplicationStatus, UserRole } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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
            application: { findUnique: jest.fn(), update: jest.fn() },
            statusHistory: { create: jest.fn(), findMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: { sendContractConfirmation: jest.fn() },
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

  describe('validateTransition', () => {
    it('should throw error if APPLIED -> CONTRACTED (invalid jump)', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.APPLIED,
          ApplicationStatus.CONTRACTED,
          { status: ApplicationStatus.CONTRACTED },
        );
      }).toThrow(BadRequestException);
    });

    it('should allow APPLIED -> INTERVIEWING', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.APPLIED,
          ApplicationStatus.INTERVIEWING,
          { status: ApplicationStatus.INTERVIEWING },
        );
      }).not.toThrow();
    });

    it('should throw error if INTERVIEWING -> CONTRACTED without contractUrl', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.INTERVIEWING,
          ApplicationStatus.CONTRACTED,
          { status: ApplicationStatus.CONTRACTED },
        );
      }).toThrow(BadRequestException);
    });

    it('should allow INTERVIEWING -> CONTRACTED with contractUrl', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.INTERVIEWING,
          ApplicationStatus.CONTRACTED,
          {
            status: ApplicationStatus.CONTRACTED,
            contractUrl: 'http://example.com',
          },
        );
      }).not.toThrow();
    });

    it('should always allow transitioning to CLOSED', () => {
      expect(() => {
        service.validateTransition(
          ApplicationStatus.APPLIED,
          ApplicationStatus.CLOSED,
          { status: ApplicationStatus.CLOSED },
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
        email: 'test@test.com',
      } as any;
      jest.spyOn(prisma.application, 'findUnique').mockResolvedValue(mockApp);

      const transactionMock = jest.fn().mockImplementation(async (cb) => {
        return cb(prisma);
      });
      jest.spyOn(prisma, '$transaction').mockImplementation(transactionMock);

      const emailSpy = jest
        .spyOn(emailService, 'sendContractConfirmation')
        .mockResolvedValue(undefined);

      await service.updateStatus(
        'uuid',
        {
          status: ApplicationStatus.CONTRACTED,
          contractUrl: 'url',
        },
        'user1',
      );

      expect(transactionMock).toHaveBeenCalled();
      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: 'uuid' },
        data: { status: ApplicationStatus.CONTRACTED, contractUrl: 'url' },
      });
      expect(prisma.statusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'uuid',
          previousStatus: ApplicationStatus.INTERVIEWING,
          newStatus: ApplicationStatus.CONTRACTED,
          changedBy: 'user1',
        },
      });
      expect(emailSpy).toHaveBeenCalledWith('test@test.com', 'url');
    });
  });

  describe('getHistory', () => {
    it('should return history', async () => {
      const mockApp = { id: 'uuid' } as any;
      jest.spyOn(prisma.application, 'findUnique').mockResolvedValue(mockApp);

      const historyResult = [{ id: 'hist1' }] as any;
      jest
        .spyOn(prisma.statusHistory, 'findMany')
        .mockResolvedValue(historyResult);

      const res = await service.getHistory('uuid');
      expect(res).toEqual(historyResult);
      expect(prisma.statusHistory.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'uuid' },
        orderBy: { timestamp: 'asc' },
      });
    });
  });
});
