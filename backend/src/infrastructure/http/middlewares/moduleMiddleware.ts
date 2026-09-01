import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../../shared/errors/AppError';
import { ModuleKey, modulesInclude, parseEnabledModules } from '../../../shared/constants/modules';
import prisma from '../../database/prisma';

/**
 * Gatillo por módulo de empresa, análogo a requireFeature() pero leyendo
 * companies.enabledModules en vez del plan.
 *
 * Hasta ahora los módulos se respetaban sólo en el frontend (usePermissions
 * escondía el nav). Para `imagenes` eso no alcanza: un módulo apagado que
 * igual firma URLs de subida deja escribir en un bucket que pagamos nosotros.
 */

// Cache en memoria: companyId → { modules, expiresAt }
const moduleCache = new Map<string, { modules: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getCompanyModules(companyId: string): Promise<string[]> {
  const cached = moduleCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.modules;

  const rows = await prisma.$queryRaw<{ enabledModules: string | null }[]>`
    SELECT "enabledModules" FROM "companies" WHERE id = ${companyId} LIMIT 1
  `;
  const modules = parseEnabledModules(rows[0]?.enabledModules);
  moduleCache.set(companyId, { modules, expiresAt: Date.now() + CACHE_TTL_MS });
  return modules;
}

export function invalidateModuleCache(companyId: string): void {
  moduleCache.delete(companyId);
}

export async function companyHasModule(companyId: string, key: ModuleKey): Promise<boolean> {
  return modulesInclude(await getCompanyModules(companyId), key);
}

/**
 * Devuelve 403 si la empresa no tiene el módulo activo.
 * Uso: router.post('/x', requireModule('imagenes'), handler)
 */
export function requireModule(key: ModuleKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.companyId) throw new ForbiddenError('No company context');

      if (!(await companyHasModule(req.companyId, key))) {
        const err = new ForbiddenError(
          'Este módulo no está habilitado para tu empresa. Contactá a soporte para activarlo.'
        );
        (err as any).moduleKey = key;
        throw err;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
