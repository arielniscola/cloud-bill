import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/AppError';
import { JwtPayload, UserRole } from '../../../shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      companyId?: string;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('No token provided');
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    throw new UnauthorizedError('Token error');
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    throw new UnauthorizedError('Token malformatted');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;

    // Resolve active company:
    // 1. If user has a company in JWT → always use that
    // 2. If super-admin (no companyId in JWT) → use X-Company-Id header
    if (decoded.companyId) {
      req.companyId = decoded.companyId;
    } else {
      const headerCompany = req.headers['x-company-id'] as string | undefined;
      req.companyId = headerCompany || '00000000-0000-0000-0000-000000000001';
    }

    next();
  } catch {
    throw new UnauthorizedError('Invalid token');
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
}
