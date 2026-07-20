import { container } from 'tsyringe';
import { IRecurringInvoiceRepository } from '../../domain/repositories/IRecurringInvoiceRepository';
import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { IActivityLogRepository } from '../../domain/repositories/IActivityLogRepository';
import { RecurringInvoice, RecurringFrequency } from '../../domain/entities/RecurringInvoice';
import { setSaleWarehouse } from '../../shared/utils/saleWarehouse';
import prisma from '../database/prisma';

const FREQ_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

/**
 * Próxima corrida a partir de una fecha. Para frecuencias mensuales o mayores
 * respeta dayOfMonth (1-28, así febrero nunca rompe); WEEKLY suma 7 días.
 * Conserva la hora de la corrida original.
 */
export function computeNextRun(from: Date, frequency: RecurringFrequency, dayOfMonth: number | null): Date {
  const next = new Date(from);
  if (frequency === 'WEEKLY') {
    next.setDate(next.getDate() + 7);
    return next;
  }
  const months = FREQ_MONTHS[frequency] ?? 1;
  const targetDay = Math.min(dayOfMonth ?? next.getDate(), 28);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  next.setDate(targetDay);
  return next;
}

export class RecurringInvoiceService {
  /**
   * Genera las facturas (en borrador) de todos los abonos vencidos.
   * Idempotente ante corridas concurrentes: cada corrida se "reclama" avanzando
   * nextRunAt de forma atómica antes de generar. Si el server estuvo apagado,
   * las corridas atrasadas se recuperan de a una por pasada (cap de seguridad).
   */
  async generateDueInvoices(): Promise<{ generated: number; errors: number }> {
    const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
    let generated = 0;
    let errors = 0;

    // Hasta 12 pasadas: recupera abonos muy atrasados sin loopear infinito.
    for (let pass = 0; pass < 12; pass++) {
      const due = await repo.findDue();
      if (due.length === 0) break;

      for (const rec of due) {
        // Vencimiento del abono: se desactiva sin generar.
        if (rec.endDate && rec.nextRunAt > rec.endDate) {
          await repo.update(rec.id, { isActive: false });
          continue;
        }

        const scheduledFor = rec.nextRunAt;
        const newNext = computeNextRun(scheduledFor, rec.frequency, rec.dayOfMonth);
        const claimed = await repo.claimRun(rec.id, newNext);
        if (!claimed) continue; // otro proceso la tomó

        try {
          await this.generateInvoiceFrom(rec, scheduledFor);
          await repo.recordRun(rec.id, new Date());
          generated++;
        } catch (err: any) {
          // La corrida ya avanzó (no se reintenta sola): queda registrado el error.
          errors++;
          console.error(`[abonos] Error generando factura del abono "${rec.name}":`, err.message ?? err);
          const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
          await activityLogRepo.create({
            userId: rec.userId,
            action: 'CREATE',
            entity: 'RecurringInvoice',
            entityId: rec.id,
            description: `Error al generar factura del abono "${rec.name}": ${err.message ?? err}`,
          }).catch(() => {});
        }
      }
    }

    return { generated, errors };
  }

  /**
   * Genera UNA factura en borrador desde la plantilla. `invoiceDate` es la
   * fecha programada de la corrida (o hoy, para "Generar ahora").
   */
  async generateInvoiceFrom(rec: RecurringInvoice, invoiceDate: Date): Promise<{ id: string; number: string }> {
    if (!rec.items || rec.items.length === 0) {
      throw new Error('El abono no tiene ítems');
    }

    // Cliente inactivo: no facturamos y desactivamos el abono.
    const customerRows = await prisma.$queryRaw<{ isActive: boolean }[]>`
      SELECT "isActive" FROM "customers" WHERE id = ${rec.customerId} LIMIT 1
    `;
    if (!customerRows[0]?.isActive) {
      const repo = container.resolve<IRecurringInvoiceRepository>('RecurringInvoiceRepository');
      await repo.update(rec.id, { isActive: false });
      throw new Error('El cliente está inactivo — el abono fue pausado');
    }

    // Precio actual del producto (opcional) — clave con inflación.
    let priceByProduct = new Map<string, number>();
    if (rec.useCurrentPrices) {
      const ids = rec.items.map((i) => i.productId);
      const rows = await prisma.$queryRaw<{ id: string; price: any }[]>`
        SELECT id, price FROM "products" WHERE id = ANY(${ids})
      `;
      priceByProduct = new Map(rows.map((r) => [r.id, Number(r.price)]));
    }

    const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
    const invoice = await invoiceRepo.create({
      type: rec.type,
      customerId: rec.customerId,
      userId: rec.userId,
      companyId: rec.companyId,
      fiscalMode: rec.fiscalMode,
      date: invoiceDate,
      notes: rec.notes ?? null,
      paymentTerms: rec.paymentTerms ?? null,
      saleCondition: rec.saleCondition,
      stockBehavior: rec.stockBehavior,
      currency: rec.currency,
      exchangeRate: rec.exchangeRate,
      items: rec.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
        unitPrice: rec.useCurrentPrices
          ? (priceByProduct.get(item.productId) || item.unitPrice)
          : item.unitPrice,
        discountPct: item.discountPct,
        taxRate: item.taxRate,
      })),
    } as any);

    await setSaleWarehouse('invoices', invoice.id, rec.warehouseId ?? null);

    // Trazabilidad abono → factura (columna nueva; tolera migración pendiente).
    try {
      await prisma.$executeRaw`
        UPDATE "invoices" SET "recurringInvoiceId" = ${rec.id} WHERE id = ${invoice.id}
      `;
    } catch { /* migración 20260715120000 pendiente */ }

    const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    await activityLogRepo.create({
      userId: rec.userId,
      action: 'CREATE',
      entity: 'Invoice',
      entityId: invoice.id,
      description: `Factura ${invoice.number} generada automáticamente por el abono "${rec.name}" (borrador)`,
    }).catch(() => {});

    return { id: invoice.id, number: invoice.number };
  }
}

export const recurringInvoiceService = new RecurringInvoiceService();
