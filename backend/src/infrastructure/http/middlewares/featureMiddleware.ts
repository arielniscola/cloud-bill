import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../../shared/errors/AppError';
import { FeatureKey, planHasFeature } from '../../../shared/constants/planFeatures';
import prisma from '../../database/prisma';

// In-memory cache: companyId → { plan, expiresAt }
const planCache = new Map<string, { plan: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getCompanyPlan(companyId: string): Promise<string> {
  const cached = planCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.plan;

  const rows = await prisma.$queryRaw<{ plan: string }[]>`
    SELECT "plan" FROM "companies" WHERE id = ${companyId} LIMIT 1
  `;
  const plan = rows[0]?.plan ?? 'PRO';
  planCache.set(companyId, { plan, expiresAt: Date.now() + CACHE_TTL_MS });
  return plan;
}

export function invalidatePlanCache(companyId: string): void {
  planCache.delete(companyId);
}

/**
 * Middleware factory — returns 403 if the company's plan doesn't include the feature.
 * Usage: router.get('/accounting/accounts', requireFeature('accounting'), handler)
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.companyId) {
        throw new ForbiddenError('No company context');
      }
      const plan = await getCompanyPlan(req.companyId);
      if (!planHasFeature(plan, feature)) {
        const err = new ForbiddenError(
          `Tu plan actual no incluye esta funcionalidad. Actualizá tu plan para acceder.`
        );
        (err as any).featureKey = feature;
        (err as any).currentPlan = plan;
        throw err;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Helper for use inside controllers (non-middleware contexts).
 * Returns true if the company plan includes the feature.
 */
export async function companyHasFeature(companyId: string, feature: FeatureKey): Promise<boolean> {
  const plan = await getCompanyPlan(companyId);
  return planHasFeature(plan, feature);
}
