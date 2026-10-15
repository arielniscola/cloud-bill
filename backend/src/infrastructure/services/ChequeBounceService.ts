import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../domain/repositories/ICurrentAccountRepository';
import { IOrdenPagoRepository } from '../../domain/repositories/IOrdenPagoRepository';
import { Currency } from '../../shared/types';
import { IInternalNoteRepository } from '../../domain/repositories/IInternalNoteRepository';
import { createInternalNote, cancelInternalNote } from './InternalNoteService';
import prisma from '../database/prisma';

interface ChequeBounceParams {
  customerId?: string | null;
  supplierId?: string | null;
  amount: number;
  currency?: string | null;
  reference: string;                 // N° de cheque (o número interno)
  direction: 'DEBIT' | 'CREDIT';     // DEBIT al rechazar, CREDIT al revertir
  companyId: string;
  fiscalMode?: string;
  userId: string;
}

/**
 * Genera el "débito interno" en la cuenta corriente de la parte que corresponda
 * cuando un cheque se marca como rechazado (y lo revierte si vuelve atrás).
 *  - Venta  (cliente):  DEBIT sube la deuda del cliente (no nos pagó).
 *  - Compra (proveedor): DEBIT sube lo que le debemos (nuestro cheque rebotó).
 * El débito es una NOTA DE DÉBITO INTERNA: así es imputable contra un pago o un
 * crédito, y entra en el reporte de deudores como cualquier otra deuda.
 * Si el cheque no tiene cliente ni proveedor asociado, no hace nada.
 */
export async function recordChequeBounceMovement(p: ChequeBounceParams): Promise<void> {
  if (p.amount <= 0) return;
  if (!p.customerId && !p.supplierId) return;
  const reason = `Cheque rechazado: ${p.reference}`;
  const currency = p.currency || 'ARS';

  if (p.direction === 'DEBIT') {
    await createInternalNote({
      type: 'DEBIT',
      customerId: p.customerId ?? null,
      supplierId: p.customerId ? null : p.supplierId ?? null,
      userId: p.userId,
      companyId: p.companyId,
      currency,
      amount: p.amount,
      reason,
      fiscalMode: p.fiscalMode,
    });
    return;
  }

  // Reversión: se anula la ND interna del rechazo (la última activa de ese cheque).
  const [note] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "internal_notes"
    WHERE "companyId" = ${p.companyId} AND type = 'DEBIT' AND status = 'ACTIVE' AND reason = ${reason}
      AND (${p.customerId ?? null}::text IS NULL OR "customerId" = ${p.customerId ?? null})
      AND (${p.customerId ? null : p.supplierId ?? null}::text IS NULL OR "supplierId" = ${p.customerId ? null : p.supplierId ?? null})
    ORDER BY "createdAt" DESC LIMIT 1
  `;
  if (note) {
    const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
    const full = await repo.findById(note.id);
    if (full) { await cancelInternalNote(full); return; }
  }

  // Rechazos anteriores a las notas internas: el débito era un movimiento suelto.
  const desc = `Reversión cheque rechazado: ${p.reference}`;
  if (p.customerId) {
    const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
    let account = await caRepo.findByCustomerId(p.customerId, currency as Currency, p.fiscalMode);
    if (!account) account = await caRepo.createForCustomer(p.customerId, currency as Currency, undefined, p.fiscalMode);
    await caRepo.addMovement({ currentAccountId: account.id, type: 'CREDIT', amount: p.amount, description: desc });
    return;
  }
  const opRepo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
  await opRepo.createSupplierMovement({
    supplierId: p.supplierId!,
    type: 'CREDIT',
    amount: p.amount,
    currency,
    description: desc,
    companyId: p.companyId,
    fiscalMode: (p.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
  });
}
