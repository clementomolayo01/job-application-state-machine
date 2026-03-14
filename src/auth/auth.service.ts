import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '@prisma/client';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { userId: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(registerDto: RegisterDto) {
    const { email, password } = registerDto;

    const userExists = await this.prisma.user.findUnique({ where: { email } });
    if (userExists) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: UserRole.CANDIDATE,
      },
    });

    this.emailService
      .sendWelcomeEmail(email, registerDto.name)
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to send welcome email to ${email}`,
          err instanceof Error ? err.stack : String(err),
        );
      });

    const payload = { userId: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async seedDefaultUsers() {
    const adminEmail = 'admin@example.com';
    const companyEmail = 'company@example.com';
    const candidateEmail = 'candidate@example.com';

    const adminExists = await this.prisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await this.prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          role: UserRole.ADMIN,
        },
      });
    }

    const companyExists = await this.prisma.user.findUnique({
      where: { email: companyEmail },
    });
    if (!companyExists) {
      const hashedPassword = await bcrypt.hash('company123', 10);
      await this.prisma.user.create({
        data: {
          email: companyEmail,
          password: hashedPassword,
          role: UserRole.COMPANY,
        },
      });
    }

    const candidateExists = await this.prisma.user.findUnique({
      where: { email: candidateEmail },
    });
    if (!candidateExists) {
      const hashedPassword = await bcrypt.hash('candidate123', 10);
      await this.prisma.user.create({
        data: {
          email: candidateEmail,
          password: hashedPassword,
          role: UserRole.CANDIDATE,
        },
      });
    }
  }
}
