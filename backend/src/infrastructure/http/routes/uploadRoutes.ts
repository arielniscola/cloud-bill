import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import path from 'path';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { getStorageService, LocalStorageService } from '../../storage';
import { env } from '../../config/env';

/**
 * Rutas del driver de storage local: reciben la subida y sirven los archivos.
 * Con STORAGE_DRIVER=s3 no hacen nada — el navegador habla directo con el
 * bucket y estas rutas devuelven 404.
 *
 * No llevan authMiddleware a propósito: la autorización es la firma HMAC de
 * la URL (para la subida) y el hecho de ser contenido público (para la
 * lectura), igual que en un bucket real. Poner JWT acá rompería la simetría
 * con el driver S3 y obligaría a que el frontend mande el token al bucket.
 */

const router = Router();

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function requireLocalDriver(_req: Request, _res: Response, next: NextFunction): void {
  const storage = getStorageService();
  if (!(storage instanceof LocalStorageService)) {
    next(new NotFoundError('Ruta'));
    return;
  }
  next();
}

function localStorage(): LocalStorageService {
  return getStorageService() as LocalStorageService;
}

// Subida: el body es el archivo crudo, no JSON.
router.put(
  '/local/*',
  requireLocalDriver,
  express.raw({ type: '*/*', limit: env.MAX_IMAGE_BYTES }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = (req.params as unknown as string[])[0];
      const expiresAt = Number(req.query.exp);
      const signature = String(req.query.sig ?? '');

      if (!localStorage().verifyUploadSignature(key, expiresAt, signature)) {
        throw new AppError('URL de subida inválida o vencida', 403);
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError('Cuerpo vacío', 400);
      }

      await localStorage().put(key, req.body);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }
);

// Lectura pública — el equivalente al dominio público del bucket.
router.get('/files/*', requireLocalDriver, (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = (req.params as unknown as string[])[0];
    const absolute = localStorage().absolutePath(key);
    const contentType = CONTENT_TYPES[path.extname(absolute).toLowerCase()];
    if (!contentType) throw new NotFoundError('Archivo');

    res.type(contentType);
    // El nombre del objeto es aleatorio e inmutable: se puede cachear fuerte.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(absolute, (err) => {
      if (err) next(new NotFoundError('Archivo'));
    });
  } catch (error) {
    next(error);
  }
});

export { router as uploadRoutes };
