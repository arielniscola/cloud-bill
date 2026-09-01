import crypto from 'crypto';
import {
  IStorageService,
  CreateUploadUrlParams,
  PresignedUpload,
} from '../../domain/services/IStorageService';

/**
 * Driver S3-compatible. Sirve tal cual para Cloudflare R2, AWS S3,
 * Backblaze B2, Supabase Storage y MinIO — sólo cambian las variables
 * de entorno (endpoint, región, credenciales).
 *
 * La firma SigV4 está implementada a mano en vez de usar @aws-sdk/client-s3
 * por dos motivos: el SDK pesa ~20 MB en el bundle de una function serverless
 * (donde el arranque en frío se paga en cada request), y firmar un PUT
 * prefirmado son 40 líneas de HMAC. No se firma ningún otro tipo de request.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
/** En una URL prefirmada el cuerpo no se conoce al firmar. */
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base pública del bucket (dominio de R2, CDN). Sin barra final. */
  publicBaseUrl: string;
  /** true → https://host/bucket/key ; false → https://bucket.host/key */
  forcePathStyle: boolean;
}

/** Encodea siguiendo RFC 3986, que es lo que exige SigV4 (encodeURIComponent deja fuera !'()*). */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

export class S3CompatibleStorageService implements IStorageService {
  readonly driver = 's3';

  constructor(private readonly config: S3StorageConfig) {}

  async createUploadUrl({
    key,
    expiresInSeconds = 300,
  }: CreateUploadUrlParams): Promise<PresignedUpload> {
    return {
      uploadUrl: this.sign('PUT', key, expiresInSeconds),
      // Sólo se firma el header `host`, así que el navegador puede mandar el
      // Content-Type que quiera sin invalidar la firma. El tipo real se valida
      // en el backend antes de firmar y queda fijado por la extensión del key.
      headers: {},
      key,
      publicUrl: this.publicUrl(key),
      expiresIn: expiresInSeconds,
    };
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl}/${key.split('/').map(encodeRfc3986).join('/')}`;
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(this.sign('DELETE', key, 60), { method: 'DELETE' });
    // 404 significa que ya no está: para el llamador el resultado es el mismo.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Storage delete failed (${res.status}) for key ${key}`);
    }
  }

  /** Construye una URL prefirmada SigV4 para el método y key dados. */
  private sign(method: 'PUT' | 'DELETE', key: string, expiresInSeconds: number): string {
    const { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle } = this.config;

    const url = new URL(endpoint);
    const host = forcePathStyle ? url.host : `${bucket}.${url.host}`;

    const encodedKey = key.split('/').map(encodeRfc3986).join('/');
    const canonicalUri = forcePathStyle
      ? `/${encodeRfc3986(bucket)}/${encodedKey}`
      : `/${encodedKey}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

    // Los parámetros ya están en orden alfabético, que es el que exige SigV4.
    const canonicalQuery = [
      `X-Amz-Algorithm=${ALGORITHM}`,
      `X-Amz-Credential=${encodeRfc3986(`${accessKeyId}/${scope}`)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${expiresInSeconds}`,
      `X-Amz-SignedHeaders=host`,
    ].join('&');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      UNSIGNED_PAYLOAD,
    ].join('\n');

    const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), SERVICE),
      'aws4_request'
    );
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    return `${url.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}
