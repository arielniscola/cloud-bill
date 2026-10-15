import prisma from './prisma';

// Columnas nuevas que llegan con migraciones manuales: mientras no se apliquen,
// los repos leen un valor por defecto y saltean la escritura en vez de romper.
// El resultado se cachea por proceso (una migración se aplica con reinicio).
const cache = new Map<string, boolean>();

export async function columnExists(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    ) AS "exists"
  `;
  const exists = rows[0]?.exists ?? false;
  cache.set(key, exists);
  return exists;
}
