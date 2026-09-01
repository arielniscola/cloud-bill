import path from 'path';
import { IStorageService } from '../../domain/services/IStorageService';
import { env } from '../config/env';
import { LocalStorageService } from './LocalStorageService';
import { S3CompatibleStorageService } from './S3CompatibleStorageService';

/**
 * Elige el driver de storage según STORAGE_DRIVER.
 *
 * El resto de la app depende sólo de IStorageService: cambiar de proveedor
 * es cambiar el .env. Configuraciones de referencia:
 *
 *   Cloudflare R2
 *     STORAGE_DRIVER=s3
 *     STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
 *     STORAGE_REGION=auto
 *     STORAGE_PUBLIC_BASE_URL=https://<dominio-publico-del-bucket>
 *
 *   AWS S3
 *     STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
 *     STORAGE_REGION=us-east-1
 *
 *   Backblaze B2
 *     STORAGE_ENDPOINT=https://s3.us-west-004.backblazeb2.com
 *     STORAGE_REGION=us-west-004
 *
 *   Supabase Storage
 *     STORAGE_ENDPOINT=https://<proyecto>.supabase.co/storage/v1/s3
 *     STORAGE_REGION=us-east-1
 */

let instance: IStorageService | null = null;

function build(): IStorageService {
  if (env.STORAGE_DRIVER === 's3') {
    const missing = (
      [
        ['STORAGE_ENDPOINT', env.STORAGE_ENDPOINT],
        ['STORAGE_BUCKET', env.STORAGE_BUCKET],
        ['STORAGE_ACCESS_KEY_ID', env.STORAGE_ACCESS_KEY_ID],
        ['STORAGE_SECRET_ACCESS_KEY', env.STORAGE_SECRET_ACCESS_KEY],
        ['STORAGE_PUBLIC_BASE_URL', env.STORAGE_PUBLIC_BASE_URL],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `STORAGE_DRIVER=s3 requiere: ${missing.join(', ')}. ` +
          'Configuralas o usá STORAGE_DRIVER=local para desarrollo.'
      );
    }

    return new S3CompatibleStorageService({
      endpoint: env.STORAGE_ENDPOINT!,
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET!,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY!,
      publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL!.replace(/\/+$/, ''),
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    });
  }

  return new LocalStorageService({
    rootDir: path.isAbsolute(env.STORAGE_LOCAL_DIR)
      ? env.STORAGE_LOCAL_DIR
      : path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR),
    publicApiUrl: env.PUBLIC_API_URL.replace(/\/+$/, ''),
    signingSecret: env.JWT_SECRET,
  });
}

/** Instancia única — se construye en el primer uso, no al importar. */
export function getStorageService(): IStorageService {
  if (!instance) instance = build();
  return instance;
}

export { LocalStorageService } from './LocalStorageService';
export { S3CompatibleStorageService } from './S3CompatibleStorageService';
