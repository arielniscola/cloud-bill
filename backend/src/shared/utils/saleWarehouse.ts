import { Prisma } from '@prisma/client';
import { container } from 'tsyringe';
import prisma from '../../infrastructure/database/prisma';
import { IWarehouseRepository } from '../../domain/repositories/IWarehouseRepository';
import { Warehouse } from '../../domain/entities/Stock';

type SaleTable = 'invoices' | 'orden_pedidos';

// La columna warehouseId llega con la migración 20260713120000_add_sale_warehouse;
// como las migraciones de este proyecto pueden estar pendientes de aplicar, se
// verifica su existencia una sola vez por tabla (mismo patrón que discountPct).
const columnCache = new Map<SaleTable, boolean>();

async function hasWarehouseColumn(table: SaleTable): Promise<boolean> {
  const cached = columnCache.get(table);
  if (cached !== undefined) return cached;
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = 'warehouseId'
    ) AS "exists"
  `;
  const exists = rows[0]?.exists ?? false;
  columnCache.set(table, exists);
  return exists;
}

function tableSql(table: SaleTable): Prisma.Sql {
  return table === 'invoices' ? Prisma.sql`"invoices"` : Prisma.sql`"orden_pedidos"`;
}

/**
 * Depósito de stock de un documento de venta: el elegido en el documento
 * (leído por SQL crudo — el cliente Prisma puede estar desactualizado) o el
 * depósito por defecto de la empresa si el documento no fija uno.
 */
export async function resolveSaleWarehouse(
  table: SaleTable,
  docId: string,
  companyId?: string
): Promise<Warehouse | null> {
  const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');
  if (await hasWarehouseColumn(table)) {
    const rows = await prisma.$queryRaw<{ warehouseId: string | null }[]>`
      SELECT "warehouseId" FROM ${tableSql(table)} WHERE id = ${docId} LIMIT 1
    `;
    const chosen = rows[0]?.warehouseId ?? null;
    if (chosen) {
      const warehouse = await warehouseRepository.findById(chosen);
      if (warehouse) return warehouse;
    }
  }
  return warehouseRepository.findDefaultOrFirstActive(companyId);
}

/** warehouseId crudo del documento (null si no fijó uno o la migración no corrió). */
export async function getSaleWarehouseId(table: SaleTable, docId: string): Promise<string | null> {
  if (!(await hasWarehouseColumn(table))) return null;
  const rows = await prisma.$queryRaw<{ warehouseId: string | null }[]>`
    SELECT "warehouseId" FROM ${tableSql(table)} WHERE id = ${docId} LIMIT 1
  `;
  return rows[0]?.warehouseId ?? null;
}

/** Persiste el depósito elegido en el documento (no-op si la migración no corrió). */
export async function setSaleWarehouse(
  table: SaleTable,
  docId: string,
  warehouseId: string | null | undefined
): Promise<void> {
  if (warehouseId === undefined) return;
  if (!(await hasWarehouseColumn(table))) return;
  await prisma.$executeRaw`
    UPDATE ${tableSql(table)} SET "warehouseId" = ${warehouseId ?? null} WHERE id = ${docId}
  `;
}
