import 'reflect-metadata';
import '../../src/container';
import { container } from 'tsyringe';
import { randomUUID } from 'crypto';
import prisma from '../../src/infrastructure/database/prisma';
import { ICurrentAccountRepository } from '../../src/domain/repositories/ICurrentAccountRepository';
import { IStockRepository } from '../../src/domain/repositories/IWarehouseRepository';
import { COMPANY_A, ADMIN_A } from '../fixtures';

/**
 * Los saldos y las cantidades se calculan leyendo el valor actual, sumando y
 * volviendo a escribir. Postgres corre en Read Committed, así que sin un lock
 * explícito dos operaciones simultáneas leen el MISMO valor viejo y la segunda
 * pisa a la primera: se pierde un movimiento.
 *
 * Estos tests disparan N operaciones en paralelo sobre la misma cuenta / el
 * mismo stock y exigen que no se pierda ninguna.
 */

const N = 25;
const MONTO = 10;

let customerId: string;
let currentAccountId: string;
let productId: string;
let warehouseId: string;

beforeAll(async () => {
  customerId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "customers" (id, name, "taxCondition", "isActive", "companyId", "createdAt", "updatedAt")
    VALUES (${customerId}, 'Cliente concurrencia', 'CONSUMIDOR_FINAL', true, ${COMPANY_A}, NOW(), NOW())
  `;

  currentAccountId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "current_accounts" (id, "customerId", currency, balance, "fiscalMode", "createdAt", "updatedAt")
    VALUES (${currentAccountId}, ${customerId}, 'ARS', 0, 'FORMAL', NOW(), NOW())
  `;

  warehouseId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "warehouses" (id, name, "isActive", "companyId", "createdAt", "updatedAt")
    VALUES (${warehouseId}, 'Depósito concurrencia', true, ${COMPANY_A}, NOW(), NOW())
  `;

  productId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "products" (id, sku, name, price, cost, "taxRate", "isActive", "companyId", "createdAt", "updatedAt")
    VALUES (${productId}, ${'SKU-CONC-' + productId.slice(0, 8)}, 'Producto concurrencia',
            100, 50, 21, true, ${COMPANY_A}, NOW(), NOW())
  `;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "stock_movements" WHERE "productId" = ${productId}`;
  await prisma.$executeRaw`DELETE FROM "stocks" WHERE "productId" = ${productId}`;
  await prisma.$executeRaw`DELETE FROM "products" WHERE id = ${productId}`;
  await prisma.$executeRaw`DELETE FROM "warehouses" WHERE id = ${warehouseId}`;
  await prisma.$executeRaw`DELETE FROM "account_movements" WHERE "currentAccountId" = ${currentAccountId}`;
  await prisma.$executeRaw`DELETE FROM "current_accounts" WHERE id = ${currentAccountId}`;
  await prisma.$executeRaw`DELETE FROM "customers" WHERE id = ${customerId}`;
});

describe('Concurrencia sobre saldos y stock', () => {
  it('no pierde movimientos de cuenta corriente en paralelo', async () => {
    const repo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        repo.addMovement({
          currentAccountId,
          type: 'DEBIT',
          amount: MONTO,
          description: `Débito concurrente ${i + 1}`,
        } as any)
      )
    );

    const [cuenta] = await prisma.$queryRaw<{ balance: string }[]>`
      SELECT balance FROM "current_accounts" WHERE id = ${currentAccountId}
    `;
    expect(Number(cuenta.balance)).toBe(N * MONTO);

    // La columna `balance` de cada movimiento es la foto histórica que muestra
    // el extracto: tiene que ser la escalera 10, 20, 30... sin repetidos.
    const movs = await prisma.$queryRaw<{ balance: string }[]>`
      SELECT balance FROM "account_movements"
      WHERE "currentAccountId" = ${currentAccountId}
      ORDER BY balance ASC
    `;
    expect(movs).toHaveLength(N);
    expect(movs.map((m) => Number(m.balance))).toEqual(
      Array.from({ length: N }, (_, i) => (i + 1) * MONTO)
    );
  });

  it('no pierde movimientos de stock en paralelo', async () => {
    const repo = container.resolve<IStockRepository>('StockRepository');

    // Ingresos concurrentes sobre una fila de stock que todavía no existe:
    // el caso que un SELECT ... FOR UPDATE no podría cubrir.
    await Promise.all(
      Array.from({ length: N }, () =>
        repo.addMovement({
          productId,
          warehouseId,
          type: 'PURCHASE',
          quantity: 2,
          userId: ADMIN_A.id,
          reason: 'Ingreso concurrente',
        } as any)
      )
    );

    const [stock] = await prisma.$queryRaw<{ quantity: string }[]>`
      SELECT quantity FROM "stocks"
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND "variantId" IS NULL
    `;
    expect(Number(stock.quantity)).toBe(N * 2);
  });

  it('no deja vender por debajo de cero con salidas concurrentes', async () => {
    const repo = container.resolve<IStockRepository>('StockRepository');

    // Hay 50 unidades del test anterior. 40 salidas de 2 = 80 > 50: algunas
    // tienen que fallar, pero el stock jamás puede quedar negativo.
    const resultados = await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        repo.addMovement({
          productId,
          warehouseId,
          type: 'SALE',
          quantity: 2,
          userId: ADMIN_A.id,
          reason: 'Salida concurrente',
        } as any)
      )
    );

    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    const [stock] = await prisma.$queryRaw<{ quantity: string }[]>`
      SELECT quantity FROM "stocks"
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND "variantId" IS NULL
    `;

    expect(ok).toBe(25); // exactamente las que entraban en las 50 unidades
    expect(Number(stock.quantity)).toBe(0);
    expect(Number(stock.quantity)).toBeGreaterThanOrEqual(0);
  });
});
