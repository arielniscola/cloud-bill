import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { COMPANY_A, COMPANY_B, ADMIN_A, SELLER_A, ADMIN_B, TEST_PASSWORD } from './fixtures';

/**
 * Corre UNA vez por invocación de jest:
 * 1. Crea la base cloudbill_test si no existe.
 * 2. Aplica todas las migraciones (prisma migrate deploy).
 * 3. Trunca todas las tablas (corridas deterministas).
 * 4. Siembra 2 empresas + usuarios con IDs fijos (ver fixtures.ts).
 */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

  const testUrl = process.env.DATABASE_URL!;
  if (!testUrl.includes('cloudbill_test')) {
    throw new Error('DATABASE_URL de .env.test no apunta a cloudbill_test — abortando.');
  }
  const parsed = new URL(testUrl);
  const dbName = parsed.pathname.slice(1);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');

  // 1. Crear la DB si falta (conectando a la DB de mantenimiento "postgres")
  const adminParsed = new URL(testUrl);
  adminParsed.pathname = '/postgres';
  adminParsed.search = '';
  const admin = new PrismaClient({ datasources: { db: { url: adminParsed.toString() } } });
  try {
    const rows: unknown[] = await admin.$queryRawUnsafe(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`
    );
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`[tests] Base ${dbName} creada`);
    }
  } finally {
    await admin.$disconnect();
  }

  // 2. Migraciones
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    // 3. Limpiar todo menos el historial de migraciones
    const tables: { tablename: string }[] = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    );
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`
      );
    }

    // 4. Seed mínimo — SQL crudo para no depender de un cliente Prisma regenerado
    const hash = bcrypt.hashSync(TEST_PASSWORD, 10);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "companies" (id, name, "taxCondition", "isActive", "enabledModules", "createdAt", "updatedAt")
       VALUES
         ('${COMPANY_A}', 'Empresa A (test)', 'RESPONSABLE_INSCRIPTO', true, 'ALL', NOW(), NOW()),
         ('${COMPANY_B}', 'Empresa B (test)', 'RESPONSABLE_INSCRIPTO', true, 'ALL', NOW(), NOW())`
    );

    const users = [ADMIN_A, SELLER_A, ADMIN_B];
    for (const u of users) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "users" (id, username, password, name, role, "isActive", "companyId", "createdAt", "updatedAt")
         VALUES ('${u.id}', '${u.username}', '${hash}', '${u.name}', '${u.role}'::"UserRole", true, '${u.companyId}', NOW(), NOW())`
      );
    }
    console.log('[tests] Seed listo: 2 empresas, 3 usuarios');
  } finally {
    await prisma.$disconnect();
  }
}
