import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  IStorageService,
  CreateUploadUrlParams,
  PresignedUpload,
} from '../../domain/services/IStorageService';

/**
 * Driver de disco local — para desarrollo y para la instalación on-premise,
 * donde no hay bucket ni cuenta en ningún proveedor.
 *
 * Imita el contrato del driver S3: firma una URL de subida (apuntando al
 * propio backend en vez de al bucket) y el navegador hace el mismo PUT. Así
 * el frontend es idéntico con los dos drivers y se puede desarrollar la
 * feature completa antes de decidir la plataforma.
 *
 * NO usar en Vercel: el filesystem es efímero y el body está capado a 4.5 MB.
 */
export interface LocalStorageConfig {
  /** Directorio raíz donde se guardan los archivos. */
  rootDir: string;
  /** URL base del backend, ej. http://localhost:3000. Sin barra final. */
  publicApiUrl: string;
  /** Secreto con el que se firman las URLs de subida. */
  signingSecret: string;
}

/** Keys aceptadas: sólo alfanuméricos, `/`, `.`, `_` y `-`, y nunca `..`. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/._-]*$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

export class LocalStorageService implements IStorageService {
  readonly driver = 'local';

  constructor(private readonly config: LocalStorageConfig) {}

  async createUploadUrl({
    key,
    expiresInSeconds = 300,
  }: CreateUploadUrlParams): Promise<PresignedUpload> {
    assertSafeKey(key);
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(key, expiresAt);
    const query = `exp=${expiresAt}&sig=${signature}`;

    return {
      uploadUrl: `${this.config.publicApiUrl}/api/uploads/local/${key}?${query}`,
      headers: {},
      key,
      publicUrl: this.publicUrl(key),
      expiresIn: expiresInSeconds,
    };
  }

  publicUrl(key: string): string {
    return `${this.config.publicApiUrl}/api/uploads/files/${key}`;
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await fs.rm(this.absolutePath(key), { force: true });
  }

  /** Guarda el archivo — lo llama la ruta que recibe el PUT. */
  async put(key: string, body: Buffer): Promise<void> {
    assertSafeKey(key);
    const target = this.absolutePath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  /** Valida la firma de una URL de subida. Comparación en tiempo constante. */
  verifyUploadSignature(key: string, expiresAt: number, signature: string): boolean {
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
    const expected = Buffer.from(this.sign(key, expiresAt));
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  absolutePath(key: string): string {
    assertSafeKey(key);
    return path.join(this.config.rootDir, key);
  }

  private sign(key: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.config.signingSecret)
      .update(`${key}:${expiresAt}`, 'utf8')
      .digest('hex');
  }
}
