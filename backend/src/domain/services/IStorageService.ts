/**
 * Almacenamiento de archivos binarios — agnóstico del proveedor.
 *
 * El backend NUNCA recibe el archivo: firma una URL y el navegador sube
 * directo al storage. Es obligatorio en el deploy actual (Vercel serverless)
 * porque el body de una function está limitado a 4.5 MB y el filesystem es
 * efímero, pero además evita pagar tráfico de subida dos veces.
 *
 * Los drivers concretos viven en infrastructure/storage. Cambiar de proveedor
 * (R2, S3, B2, Supabase, MinIO) es cambiar variables de entorno, no código:
 * todos hablan la misma API S3.
 */

export interface PresignedUpload {
  /** URL a la que el navegador hace el PUT con el archivo como body. */
  uploadUrl: string;
  /** Headers que el navegador debe mandar en ese PUT (puede venir vacío). */
  headers: Record<string, string>;
  /** Key del objeto dentro del bucket — se guarda en la BD para poder borrarlo. */
  key: string;
  /** URL pública final, ya servible una vez que el PUT termina. */
  publicUrl: string;
  /** Segundos de validez de uploadUrl. */
  expiresIn: number;
}

export interface CreateUploadUrlParams {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface IStorageService {
  /** Identificador del driver activo ('local', 's3'). Útil para diagnóstico. */
  readonly driver: string;

  /** Firma una URL de subida directa para `key`. */
  createUploadUrl(params: CreateUploadUrlParams): Promise<PresignedUpload>;

  /** URL pública de un objeto ya subido. */
  publicUrl(key: string): string;

  /** Borra el objeto. No falla si no existe. */
  delete(key: string): Promise<void>;
}
