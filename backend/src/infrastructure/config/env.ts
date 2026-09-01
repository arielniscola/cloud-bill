import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // ── Storage de archivos (módulo "imagenes") ──────────────────────
  // 'local' = disco del servidor (desarrollo / on-premise).
  // 's3'    = cualquier proveedor S3-compatible: R2, S3, B2, Supabase, MinIO.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
  // Path-style (https://host/bucket/key) es lo que soportan todos los
  // proveedores; virtual-hosted sólo algunos. Por eso el default es true.
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  STORAGE_LOCAL_DIR: z.string().default('uploads'),
  /** URL base del backend — el driver local la usa para armar las URLs. */
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  /** Tamaño máximo aceptado por imagen, en bytes. */
  MAX_IMAGE_BYTES: z.string().default('5242880').transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
