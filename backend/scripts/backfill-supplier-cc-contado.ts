/**
 * Backfill 2026-11-07: el contado también impacta la cuenta corriente del proveedor.
 *
 *  1. Facturas/ND/NC de compra de CONTADO sin movimiento → se generan (DEBIT/CREDIT).
 *  2. OPs PAGADAS con facturas y sin movimiento (pagaron contado) → CREDIT.
 *  3. OPs PAGADAS cuyo crédito quedó en otro modo fiscal que las facturas que pagan
 *     (OP cargada en "Ambos") → se regeneran sus movimientos en el modo de cada factura.
 *
 * Las OP sin facturas (pago a cuenta) sin movimiento NO se tocan: no hay forma de
 * saber si fueron un pago real; se listan para revisarlas a mano.
 *
 * Uso:  npx ts-node --transpile-only scripts/backfill-supplier-cc-contado.ts          (simula)
 *       npx ts-node --transpile-only scripts/backfill-supplier-cc-contado.ts --apply  (aplica)
 */
import 'reflect-metadata';
import prisma from '../src/infrastructure/database/prisma';
import { PrismaOrdenPagoRepository } from '../src/infrastructure/database/repositories/PrismaOrdenPagoRepository';

const APPLY = process.argv.includes('--apply');

async function main() {
  const repo = new PrismaOrdenPagoRepository();

  const invoices = await prisma.$queryRaw<{ id: string; number: string; type: string; amount: any; fiscalMode: string }[]>`
    SELECT pi.id, pi.number, pi.type, pi.amount, pi."fiscalMode"
    FROM "purchase_invoices" pi
    WHERE pi."supplierId" IS NOT NULL AND pi."saleCondition" <> 'CUENTA_CORRIENTE'
      AND NOT EXISTS (SELECT 1 FROM "supplier_account_movements" m WHERE m."purchaseInvoiceId" = pi.id)
    ORDER BY pi."createdAt"
  `;
  console.log(`\n1) Facturas de contado sin movimiento: ${invoices.length}`);
  for (const inv of invoices) {
    console.log(`   ${inv.number} ${inv.type} ${Number(inv.amount)} ${inv.fiscalMode}`);
    if (APPLY) {
      await repo.syncPurchaseInvoiceMovements(inv.id);
      // Fecha imputable = alta de la factura (no la de hoy).
      await prisma.$executeRaw`
        UPDATE "supplier_account_movements" m SET "createdAt" = pi."createdAt"
        FROM "purchase_invoices" pi WHERE pi.id = m."purchaseInvoiceId" AND pi.id = ${inv.id}
      `;
    }
  }

  const ops = await prisma.$queryRaw<{ id: string; number: string; amount: any; fiscalMode: string }[]>`
    SELECT op.id, op.number, op.amount, op."fiscalMode"
    FROM "orden_pagos" op
    WHERE op.status = 'PAID'
      AND EXISTS (SELECT 1 FROM "orden_pago_items" i WHERE i."ordenPagoId" = op.id AND i."purchaseInvoiceId" IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM "supplier_account_movements" m WHERE m."ordenPagoId" = op.id)
    ORDER BY op."createdAt"
  `;
  console.log(`\n2) OPs pagadas con facturas y sin movimiento: ${ops.length}`);
  for (const op of ops) {
    console.log(`   ${op.number} ${Number(op.amount)} ${op.fiscalMode}`);
    if (APPLY) {
      await repo.syncOrdenPagoMovements(op.id);
      await prisma.$executeRaw`
        UPDATE "supplier_account_movements" m SET "createdAt" = op."createdAt"
        FROM "orden_pagos" op WHERE op.id = m."ordenPagoId" AND op.id = ${op.id}
      `;
    }
  }

  // Crédito en un modo distinto al de las facturas que paga (sin excedente: ese
  // vive en una nota interna y no se regenera acá).
  const crossMode = await prisma.$queryRaw<{ id: string; number: string; movModes: string; invModes: string }[]>`
    SELECT op.id, op.number,
      (SELECT string_agg(DISTINCT m."fiscalMode", ',') FROM "supplier_account_movements" m WHERE m."ordenPagoId" = op.id) AS "movModes",
      (SELECT string_agg(DISTINCT pi."fiscalMode", ',') FROM "orden_pago_items" i JOIN "purchase_invoices" pi ON pi.id = i."purchaseInvoiceId" WHERE i."ordenPagoId" = op.id) AS "invModes"
    FROM "orden_pagos" op
    WHERE op.status = 'PAID'
      AND EXISTS (SELECT 1 FROM "supplier_account_movements" m WHERE m."ordenPagoId" = op.id)
      AND NOT EXISTS (SELECT 1 FROM "supplier_account_movements" m WHERE m."ordenPagoId" = op.id AND m."internalNoteId" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "orden_pago_items" i WHERE i."ordenPagoId" = op.id AND i."purchaseInvoiceId" IS NOT NULL)
      AND (
        -- paga una factura de otro modo fiscal que la OP
        EXISTS (
          SELECT 1 FROM "orden_pago_items" i JOIN "purchase_invoices" pi ON pi.id = i."purchaseInvoiceId"
          WHERE i."ordenPagoId" = op.id AND pi."fiscalMode" <> op."fiscalMode"
        )
        -- o tiene movimientos en un modo que no es el de ninguna de sus facturas
        OR EXISTS (
          SELECT 1 FROM "supplier_account_movements" m
          WHERE m."ordenPagoId" = op.id
            AND NOT EXISTS (
              SELECT 1 FROM "orden_pago_items" i JOIN "purchase_invoices" pi ON pi.id = i."purchaseInvoiceId"
              WHERE i."ordenPagoId" = op.id AND pi."fiscalMode" = m."fiscalMode"
            )
        )
      )
    ORDER BY op."createdAt"
  `;
  console.log(`\n3) OPs con crédito en otro modo fiscal que sus facturas: ${crossMode.length}`);
  for (const op of crossMode) {
    console.log(`   ${op.number} movimientos=${op.movModes} facturas=${op.invModes}`);
    if (APPLY) {
      const [orig] = await prisma.$queryRaw<{ at: Date }[]>`
        SELECT MIN("createdAt") AS at FROM "supplier_account_movements" WHERE "ordenPagoId" = ${op.id}
      `;
      await prisma.$executeRaw`DELETE FROM "supplier_account_movements" WHERE "ordenPagoId" = ${op.id}`;
      await repo.syncOrdenPagoMovements(op.id);
      await prisma.$executeRaw`UPDATE "supplier_account_movements" SET "createdAt" = ${orig.at} WHERE "ordenPagoId" = ${op.id}`;
    }
  }

  const orphans = await prisma.$queryRaw<{ number: string; amount: any; fiscalMode: string; supplier: string }[]>`
    SELECT op.number, op.amount, op."fiscalMode", s.name AS supplier
    FROM "orden_pagos" op JOIN "suppliers" s ON s.id = op."supplierId"
    WHERE op.status = 'PAID'
      AND NOT EXISTS (SELECT 1 FROM "orden_pago_items" i WHERE i."ordenPagoId" = op.id)
      AND NOT EXISTS (SELECT 1 FROM "supplier_account_movements" m WHERE m."ordenPagoId" = op.id)
  `;
  console.log(`\n4) OPs sin facturas ni movimiento (NO se tocan, revisar a mano): ${orphans.length}`);
  for (const o of orphans) console.log(`   ${o.number} ${Number(o.amount)} ${o.fiscalMode} — ${o.supplier}`);

  console.log(APPLY ? '\nAplicado.' : '\nSimulación: correr con --apply para aplicar.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
