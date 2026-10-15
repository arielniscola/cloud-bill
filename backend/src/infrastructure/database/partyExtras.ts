import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { columnExists } from './columnExists';
import { allocateSequenceValue } from './DocumentSequence';

// Columnas de la migración 20261006120000 (código visible de cliente/proveedor,
// IIBB del cliente). Se leen y escriben por SQL crudo para no depender de que
// el cliente Prisma esté regenerado, y quedan en null si la migración falta.

type WithId = { id: string };

export async function attachCustomerExtras<T extends WithId | null | undefined>(customers: T[]): Promise<T[]> {
  const list = customers.filter(Boolean) as WithId[];
  if (list.length === 0 || !(await columnExists('customers', 'code'))) return customers;
  const rows = await prisma.$queryRaw<{ id: string; code: number | null; grossIncome: string | null }[]>(
    Prisma.sql`SELECT id, "code", "grossIncome" FROM customers WHERE id IN (${Prisma.join(list.map((c) => c.id))})`
  );
  const map = new Map(rows.map((r) => [r.id, r]));
  return customers.map((c) => {
    if (!c) return c;
    const r = map.get(c.id);
    return { ...c, code: r?.code ?? null, grossIncome: r?.grossIncome ?? null };
  });
}

export async function attachCustomerExtra<T extends WithId | null | undefined>(customer: T): Promise<T> {
  return (await attachCustomerExtras([customer]))[0];
}

export async function attachSupplierExtras<T extends WithId | null | undefined>(suppliers: T[]): Promise<T[]> {
  const list = suppliers.filter(Boolean) as WithId[];
  if (list.length === 0 || !(await columnExists('suppliers', 'code'))) return suppliers;
  const rows = await prisma.$queryRaw<{ id: string; code: number | null }[]>(
    Prisma.sql`SELECT id, "code" FROM suppliers WHERE id IN (${Prisma.join(list.map((s) => s.id))})`
  );
  const map = new Map(rows.map((r) => [r.id, r.code]));
  return suppliers.map((s) => (s ? { ...s, code: map.get(s.id) ?? null } : s));
}

export async function attachSupplierExtra<T extends WithId | null | undefined>(supplier: T): Promise<T> {
  return (await attachSupplierExtras([supplier]))[0];
}

/** Asigna el próximo código visible al cliente/proveedor recién creado. */
export async function assignCustomerCode(
  id: string,
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<number | null> {
  if (!companyId || !(await columnExists('customers', 'code'))) return null;
  const client = tx ?? prisma;
  const code = await allocateSequenceValue('CUSTOMER_CODE', companyId, 0, tx);
  await client.$executeRaw`UPDATE customers SET "code" = ${code} WHERE id = ${id}`;
  return code;
}

export async function assignSupplierCode(
  id: string,
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<number | null> {
  if (!companyId || !(await columnExists('suppliers', 'code'))) return null;
  const client = tx ?? prisma;
  const code = await allocateSequenceValue('SUPPLIER_CODE', companyId, 0, tx);
  await client.$executeRaw`UPDATE suppliers SET "code" = ${code} WHERE id = ${id}`;
  return code;
}

export async function writeCustomerGrossIncome(id: string, grossIncome: string | null | undefined): Promise<void> {
  if (grossIncome === undefined || !(await columnExists('customers', 'grossIncome'))) return;
  await prisma.$executeRaw`UPDATE customers SET "grossIncome" = ${grossIncome || null} WHERE id = ${id}`;
}

/** Transporte (texto libre) de factura/remito. */
export async function readTransport(table: 'invoices' | 'remitos', id: string): Promise<string | null> {
  if (!(await columnExists(table, 'transport'))) return null;
  const rows = await prisma.$queryRaw<{ transport: string | null }[]>(
    Prisma.sql`SELECT "transport" FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id}`
  );
  return rows[0]?.transport ?? null;
}

export async function writeTransport(
  table: 'invoices' | 'remitos',
  id: string,
  transport: string | null | undefined,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (transport === undefined || !(await columnExists(table, 'transport'))) return;
  const client = tx ?? prisma;
  await client.$executeRaw(
    Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET "transport" = ${transport || null} WHERE id = ${id}`
  );
}
