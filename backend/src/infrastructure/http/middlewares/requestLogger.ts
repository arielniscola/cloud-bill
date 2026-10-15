import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

/**
 * Una línea JSON por request al terminar: quién, qué, cuánto tardó y cómo
 * salió. No registra bodies ni headers (llevan contraseñas y tokens). El id
 * vuelve en `X-Request-Id` para poder cruzar un reclamo con el log.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'test' || req.path === '/health' || req.path === '/api/health') {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const entry = {
      time: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
      userId: req.user?.userId,
      companyId: req.user ? req.companyId : undefined,
      ip: req.ip,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  });

  next();
}
