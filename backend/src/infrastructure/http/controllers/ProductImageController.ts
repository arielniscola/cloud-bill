import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { AppError, NotFoundError, ForbiddenError } from '../../../shared/errors/AppError';
import { getStorageService } from '../../storage';
import { env } from '../../config/env';

/**
 * Imagen de producto — módulo "imagenes".
 *
 * El archivo nunca pasa por el backend: se firma una URL, el navegador sube
 * directo al storage y después confirma. Son dos requests porque el segundo
 * paso (guardar la URL en la BD) sólo debe ocurrir si la subida terminó bien.
 */

/** Formatos aceptados y la extensión con la que se guarda cada uno. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const uploadUrlSchema = z.object({
  contentType: z.string(),
  size: z.number().int().positive().optional(),
});

const confirmSchema = z.object({
  key: z.string().min(1),
});

/** products/{companyId}/{productId}/{random}.{ext} */
function buildKey(companyId: string, productId: string, ext: string): string {
  return `products/${companyId}/${productId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * La key llega del cliente en el paso de confirmación, así que hay que
 * comprobar que sea una que nosotros firmamos para ESTE producto: sin esto
 * un usuario podría apuntar la imagen a un objeto de otra empresa.
 */
function keyBelongsTo(key: string, companyId: string, productId: string): boolean {
  return key.startsWith(`products/${companyId}/${productId}/`);
}

async function loadOwnedProduct(productId: string, companyId: string) {
  const repo = container.resolve<IProductRepository>('ProductRepository');
  const product = await repo.findById(productId, companyId);
  if (!product) throw new NotFoundError('Producto');
  return { repo, product };
}

export class ProductImageController {
  /** Paso 1 — devuelve la URL prefirmada a la que el navegador hace el PUT. */
  async createUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const { contentType, size } = uploadUrlSchema.parse(req.body);

      const ext = ALLOWED_TYPES[contentType];
      if (!ext) {
        throw new AppError(
          `Formato no soportado. Se aceptan: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
          400
        );
      }
      if (size !== undefined && size > env.MAX_IMAGE_BYTES) {
        const mb = (env.MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1);
        throw new AppError(`La imagen supera el máximo de ${mb} MB`, 400);
      }

      await loadOwnedProduct(req.params.id, companyId);

      const storage = getStorageService();
      const upload = await storage.createUploadUrl({
        key: buildKey(companyId, req.params.id, ext),
        contentType,
      });

      res.json({ status: 'success', data: upload });
    } catch (error) {
      next(error);
    }
  }

  /** Paso 2 — la subida terminó: se guarda la URL y se borra la imagen anterior. */
  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const { key } = confirmSchema.parse(req.body);

      if (!keyBelongsTo(key, companyId, req.params.id)) {
        throw new ForbiddenError('La imagen no corresponde a este producto');
      }

      const { repo } = await loadOwnedProduct(req.params.id, companyId);
      const storage = getStorageService();

      const { previousKey } = await repo.setImage(req.params.id, companyId, {
        url: storage.publicUrl(key),
        key,
      });
      await deleteQuietly(previousKey, key);

      const updated = await repo.findById(req.params.id, companyId);
      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const { repo } = await loadOwnedProduct(req.params.id, companyId);

      const { previousKey } = await repo.setImage(req.params.id, companyId, null);
      await deleteQuietly(previousKey);

      const updated = await repo.findById(req.params.id, companyId);
      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Borra el objeto huérfano del bucket. Si falla no se propaga: la BD ya quedó
 * consistente y el usuario no puede hacer nada al respecto — queda un archivo
 * de más, que es mucho menos grave que un 500 en una operación exitosa.
 */
async function deleteQuietly(key: string | null, keepIfEqualTo?: string): Promise<void> {
  if (!key || key === keepIfEqualTo) return;
  try {
    await getStorageService().delete(key);
  } catch (err) {
    console.error(`[storage] no se pudo borrar el objeto ${key}:`, err);
  }
}
