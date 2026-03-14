import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

interface RequestWithUser {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>(
      'roles',
      context.getHandler(),
    );
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user; // Set by Passport JWT Strategy

    if (!user) {
      return false;
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} is not authorized`);
    }

    return true;
  }
}
