import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../../shared/errors/AppError';
import { env } from '../../config/env';

export function errorMiddleware(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
      ...(error instanceof AppError &&
        'errors' in error && { errors: (error as { errors: unknown }).errors }),
    });
    return;
  }

  if (error instanceof ZodError) {
    const formattedErrors: Record<string, string[]> = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      if (!formattedErrors[path]) {
        formattedErrors[path] = [];
      }
      formattedErrors[path].push(err.message);
    });

    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: formattedErrors,
    });
    return;
  }

  // Violación de un índice único de Postgres que no atajó el caso de uso. Sin
  // esto, Prisma respondía 500 con su mensaje crudo: la consulta, la ruta
  // absoluta del repositorio en el servidor y el fragmento de código.
  const code = (error as { code?: string }).code;
  if (code === 'P2002') {
    const campos = (error as { meta?: { target?: string[] | string } }).meta?.target;
    const lista = Array.isArray(campos) ? campos.join(', ') : campos;
    res.status(409).json({
      status: 'error',
      message: lista
        ? `Ya existe un registro con ese valor (${lista})`
        : 'Ya existe un registro con esos datos',
    });
    return;
  }

  // Registro no encontrado al actualizar o borrar.
  if (code === 'P2025') {
    res.status(404).json({ status: 'error', message: 'El registro no existe o ya fue eliminado' });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error:', error);

  res.status(500).json({
    status: 'error',
    message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    ...(env.NODE_ENV !== 'production' && { stack: error.stack }),
  });
}
