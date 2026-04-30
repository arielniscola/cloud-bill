import { Request, Response, NextFunction } from 'express';
import { FiscalMode } from '../../../shared/types';

/**
 * Reads X-Fiscal-Mode header and sets req.fiscalMode.
 * Defaults to 'FORMAL' if header is missing or invalid.
 * Must be placed AFTER authMiddleware.
 */
export function fiscalModeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = (req.headers['x-fiscal-mode'] as string)?.toUpperCase();

  if (header === 'FORMAL' || header === 'INFORMAL') {
    req.fiscalMode = header as FiscalMode;
  } else if (header === 'ALL') {
    req.fiscalMode = undefined as any;
  } else {
    req.fiscalMode = 'FORMAL';
  }

  next();
}
