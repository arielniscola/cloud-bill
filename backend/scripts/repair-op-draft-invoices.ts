/**
 * Reparación (2026-11-12): facturas nacidas de una orden de pedido que quedaron
 * en BORRADOR.
 *
 * Una factura convertida desde una orden nunca debe estar en borrador: el stock
 * y la cuenta corriente los aplicó el alta de la orden, y "Emitir" sobre ese
 * borrador los duplicaría. Hoy la conversión la crea emitida, pero pueden
 * quedar casos viejos (una conversión cortada a la mitad). Antes los corregía un
 * "auto-heal" dentro del listado de facturas, que se quitó: un GET no escribe.
 *
 * Por cada factura DRAFT cuya orden de pedido la tiene como su factura:
 *   1. pasa a ISSUED (sin efectos de emisión: son los de la orden);
 *   2. los recibos vigentes de la orden se vinculan a la factura;
 *   3. se recalcula el estado según lo cobrado.
 *
 * Uso:  npx ts-node --transpile-only scripts/repair-op-draft-invoices.ts          (simula)
 *       npx ts-node --transpile-only scripts/repair-op-draft-invoices.ts --apply  (aplica)
 */
import 'reflect-metadata';
import '../src/container';
import prisma from '../src/infrastructure/database/prisma';
import { recalcInvoiceStatus } from '../src/infrastructure/services/CustomerSettlementService';

const APPLY = process.argv.includes('--apply');

async function main() {
  const drafts = await prisma.$queryRaw<{ id: string; number: string; opId: string; opNumber: string; recibos: number }[]>`
    SELECT i.id, i.number, op.id AS "opId", op.number AS "opNumber",
           (SELECT COUNT(*) FROM "recibos" r WHERE r."ordenPedidoId" = op.id AND r.status = 'EMITTED')::int AS recibos
    FROM "invoices" i
    JOIN "orden_pedidos" op ON op.id = i."ordenPedidoId" AND op."invoiceId" = i.id
    WHERE i.status::text = 'DRAFT'
    ORDER BY i."createdAt"
  `;

  console.log(`Facturas de orden de pedido en borrador: ${drafts.length}`);
  for (const d of drafts) {
    let result = '(simulado)';
    if (APPLY) {
      const status = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "invoices" SET status = 'ISSUED', "updatedAt" = NOW() WHERE id = ${d.id} AND status::text = 'DRAFT'`;
        await tx.$executeRaw`
          UPDATE "recibos" SET "invoiceId" = ${d.id}
          WHERE "ordenPedidoId" = ${d.opId} AND status = 'EMITTED' AND "invoiceId" IS NULL
        `;
        return recalcInvoiceStatus(d.id, tx);
      });
      result = `→ ${status}`;
    }
    console.log(`   ${d.number} (orden ${d.opNumber}, ${d.recibos} recibo/s) ${result}`);
  }

  if (!APPLY && drafts.length > 0) console.log('\nNada se modificó. Para aplicar, agregá --apply.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
