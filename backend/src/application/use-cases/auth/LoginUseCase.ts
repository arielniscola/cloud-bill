import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { LoginDTO } from '../../dtos/auth.dto';
import { UnauthorizedError } from '../../../shared/errors/AppError';
import { signAuthToken } from '../../../infrastructure/services/authToken';
import prisma from '../../../infrastructure/database/prisma';
import { getFeaturesForPlan } from '../../../shared/constants/planFeatures';

// Hash válido que no corresponde a ninguna contraseña real.
const DUMMY_HASH = bcrypt.hashSync('cloudbill-no-user', 10);

interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: string;
    companyId: string | null;
    companyName: string | null;
    companyLogoUrl: string | null;
    enabledModules: string[];
    plan: string;
    features: string[];
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

    // La contraseña se compara siempre —contra un hash de relleno si el usuario
    // no existe— y recién después se mira el estado de la cuenta. Así ni el
    // mensaje ni el tiempo de respuesta delatan qué usuarios existen.
    const passwordMatch = await bcrypt.compare(data.password, user?.password ?? DUMMY_HASH);

    if (!user || !passwordMatch) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('La cuenta está desactivada');
    }

    const companyId = (user as any).companyId ?? null;

    // Fetch enabledModules + plan for company users (SUPER_ADMIN has no company → all access)
    let enabledModules: string[] = ['ALL'];
    let plan = 'ENTERPRISE';
    let features: string[] = [];
    let companyName: string | null = null;
    let companyLogoUrl: string | null = null;
    if (companyId) {
      const rows = await prisma.$queryRaw<{ enabledModules: string; plan: string; name: string; logoUrl: string | null; isActive: boolean }[]>`
        SELECT "enabledModules", "plan", "name", "logoUrl", "isActive" FROM companies WHERE id = ${companyId}
      `;
      if (rows[0] && rows[0].isActive === false) {
        throw new UnauthorizedError('La empresa está desactivada');
      }
      const raw = rows[0]?.enabledModules;
      enabledModules = (!raw || raw === 'ALL') ? ['ALL'] : raw.split(',').filter(Boolean);
      plan = rows[0]?.plan ?? 'PRO';
      features = getFeaturesForPlan(plan);
      companyName = rows[0]?.name ?? null;
      companyLogoUrl = rows[0]?.logoUrl ?? null;
    }

    const token = signAuthToken({ ...user, companyId });

    return {
      token,
      user: {
        id:        user.id,
        username:  user.username,
        name:      user.name,
        role:      user.role,
        companyId,
        companyName,
        companyLogoUrl,
        enabledModules,
        plan,
        features,
      },
    };
  }
}
