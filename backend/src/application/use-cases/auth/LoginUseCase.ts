import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { LoginDTO } from '../../dtos/auth.dto';
import { UnauthorizedError } from '../../../shared/errors/AppError';
import { env } from '../../../infrastructure/config/env';
import { JwtPayload } from '../../../shared/types';
import prisma from '../../../infrastructure/database/prisma';

interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: string;
    companyId: string | null;
    enabledModules: string[];
  };
}

@injectable()
export class LoginUseCase {
  constructor(
    @inject('UserRepository')
    private userRepository: IUserRepository
  ) {}

  async execute(data: LoginDTO): Promise<LoginResult> {
    const user = await this.userRepository.findByUsername(data.username);

    if (!user) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('La cuenta está desactivada');
    }

    const passwordMatch = await bcrypt.compare(data.password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const companyId = (user as any).companyId ?? null;

    // Fetch enabledModules for company users (SUPER_ADMIN has no company → all access)
    let enabledModules: string[] = ['ALL'];
    if (companyId) {
      const rows = await prisma.$queryRaw<{ enabledModules: string }[]>`
        SELECT "enabledModules" FROM companies WHERE id = ${companyId}
      `;
      const raw = rows[0]?.enabledModules;
      enabledModules = (!raw || raw === 'ALL') ? ['ALL'] : raw.split(',').filter(Boolean);
    }

    const payload: JwtPayload = {
      userId:   user.id,
      username: user.username,
      role:     user.role,
      ...(companyId ? { companyId } : {}),
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    return {
      token,
      user: {
        id:        user.id,
        username:  user.username,
        name:      user.name,
        role:      user.role,
        companyId,
        enabledModules,
      },
    };
  }
}
