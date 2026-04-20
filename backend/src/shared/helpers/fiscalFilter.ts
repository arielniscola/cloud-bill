import { Prisma } from '@prisma/client';
import { FiscalMode, FiscalModeFilter } from '../types';

/**
 * Returns a Prisma.sql fragment to filter by fiscalMode.
 *
 * Usage in raw queries:
 *   const filter = fiscalFilter(req.fiscalMode);
 *   prisma.$queryRaw`SELECT * FROM invoices WHERE "companyId" = ${companyId} ${filter}`
 *
 * When mode is undefined (e.g. ALL from frontend), returns empty fragment (no filter).
 */
export function fiscalFilter(mode: FiscalMode | undefined, alias?: string): Prisma.Sql {
  if (!mode) return Prisma.empty;
  const col = alias ? Prisma.raw(`"${alias}"."fiscalMode"`) : Prisma.raw(`"fiscalMode"`);
  return Prisma.sql`AND ${col} = ${mode}`;
}

/**
 * Returns the fiscalMode value to store on a new record.
 * Always uses req.fiscalMode (defaults to FORMAL via middleware).
 */
export function getFiscalMode(reqFiscalMode: FiscalMode | undefined): string {
  return reqFiscalMode || 'FORMAL';
}
