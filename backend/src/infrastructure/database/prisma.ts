import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Fuerza la sesión de Postgres a UTC. Las columnas de fecha son `timestamp`
 * sin zona y Prisma las lee y escribe como UTC, pero en el SQL crudo un `NOW()`
 * o un parámetro Date se convierten con la zona de la sesión: con un servidor
 * en hora argentina las fechas se guardaban y filtraban corridas 3 horas.
 */
function withUtcSession(url: string): string {
  if (/[?&]options=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}options=-c%20TimeZone%3DUTC`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: withUtcSession(env.DATABASE_URL) } },
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
