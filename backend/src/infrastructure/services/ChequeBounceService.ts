import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../domain/repositories/ICurrentAccountRepository';
import { IOrdenPagoRepository } from '../../domain/repositories/IOrdenPagoRepository';
import { Currency } from '../../shared/types';

interface ChequeBounceParams {
  customerId?: string | null;
  supplierId?: string | null;
  amount: number;
  currency?: string | null;
  reference: string;                 // N° de cheque (o número interno)
  direction: 'DEBIT' | 'CREDIT';     // DEBIT al rechazar, CREDIT al revertir
  companyId: string;
  fiscalMode?: string;
}

/**
 * Genera el "débito interno" en la cuenta corriente de la parte que corresponda
 * cuando un cheque se marca como rechazado (y lo revierte si vuelve atrás).
 *  - Venta  (cliente):  DEBIT sube la deuda del cliente (no nos pagó).
 *  - Compra (proveedor): DEBIT sube lo que le debemos (nuestro cheque rebotó).
 * Si el cheque no tiene cliente ni proveedor asociado, no hace nada.
 */
export async function recordChequeBounceMovement(p: ChequeBounceParams): Promise<void> {
  if (p.amount <= 0) return;
  const desc = p.direction === 'DEBIT'
    ? `Cheque rechazado: ${p.reference}`
    : `Reversión cheque rechazado: ${p.reference}`;

  if (p.customerId) {
    const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
    const currency = ((p.currency || 'ARS') as Currency);
    let account = await caRepo.findByCustomerId(p.customerId, currency, p.fiscalMode);
    if (!account) account = await caRepo.createForCustomer(p.customerId, currency, undefined, p.fiscalMode);
    await caRepo.addMovement({
      currentAccountId: account.id,
      type: p.direction,
      amount: p.amount,
      description: desc,
    });
    return;
  }

  if (p.supplierId) {
    const opRepo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
    await opRepo.createSupplierMovement({
      supplierId: p.supplierId,
      type: p.direction,
      amount: p.amount,
      currency: p.currency || 'ARS',
      description: desc,
      companyId: p.companyId,
      fiscalMode: (p.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
    });
  }
}
