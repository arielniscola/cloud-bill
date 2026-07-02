import path from 'path';
import dotenv from 'dotenv';

// Debe ejecutarse antes de importar cualquier módulo de src/ (env.ts, prisma).
// `override: true` pisa variables heredadas de la shell o del .env de desarrollo.
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

if (!process.env.DATABASE_URL?.includes('cloudbill_test')) {
  throw new Error(
    'Los tests deben correr contra la base cloudbill_test (revisá backend/.env.test). Abortando para no tocar datos reales.'
  );
}
