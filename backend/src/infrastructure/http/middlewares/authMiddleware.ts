import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/AppError';
import { JwtPayload, UserRole, FiscalMode } from '../../../shared/types';
import prisma from '../../database/prisma';

declare global {
  // Así es como Express pide extender `Request`: no hay alternativa con módulos.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      companyId?: string;
      fiscalMode?: FiscalMode;
    }
  }
}

// El token dura días, así que rol, empresa y estado no se toman de él: se leen
// del usuario en cada request. Sin esto, un usuario desactivado, borrado o con
// el rol cambiado seguía entrando hasta que el token vencía. Cache corto para
// no pegarle a la base en cada llamada.
interface UserState { role: UserRole; isActive: boolean; companyId: string | null }

const userStateCache = new Map<string, { state: UserState | null; expiresAt: number }>();
const USER_STATE_TTL_MS = 30_000;

async function getUserState(userId: string): Promise<UserState | null> {
  const cached = userStateCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const rows = await prisma.$queryRaw<UserState[]>`
    SELECT role::text AS role, "isActive", "companyId" FROM "users" WHERE id = ${userId} LIMIT 1
  `;
  const state = rows[0] ?? null;
  userStateCache.set(userId, { state, expiresAt: Date.now() + USER_STATE_TTL_MS });
  return state;
}

/** Llamar al editar, desactivar o borrar un usuario: el cambio rige en el próximo request. */
export function invalidateUserState(userId: string): void {
  userStateCache.delete(userId);
}

function verifyToken(req: Request): JwtPayload {
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
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid token');
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const decoded = verifyToken(req);

    const state = await getUserState(decoded.userId);
    if (!state || !state.isActive) {
      throw new UnauthorizedError('Usuario inactivo o inexistente');
    }

    req.user = { ...decoded, role: state.role, companyId: state.companyId ?? undefined };

    // Resolve active company:
    // 1. If user has a company → always use that
    // 2. If super-admin (no company) → use X-Company-Id header
    if (state.companyId) {
      req.companyId = state.companyId;
    } else {
      const headerCompany = req.headers['x-company-id'] as string | undefined;
      req.companyId = headerCompany || '00000000-0000-0000-0000-000000000001';
    }

    next();
  } catch (error) {
    next(error);
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
