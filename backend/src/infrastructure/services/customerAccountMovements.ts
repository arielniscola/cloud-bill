import { Prisma } from '@prisma/client';
import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../domain/repositories/ICurrentAccountRepository';
import { Currency } from '../../shared/types';

/**
 * Movimiento en la cuenta corriente del cliente (la crea si no existe), con sus
 * vínculos: `reciboId` para el movimiento principal de un cobro y
 * `sourceReciboId` para los accesorios (descuento cedido / recargo), que se
 * revierten junto con el recibo.
 */
export async function addCustomerMovement(
  p: {
    customerId: string;
    currency: string;
    fiscalMode?: string | null;
    type: 'DEBIT' | 'CREDIT';
    amount: number;
    description: string;
    invoiceId?: string | null;
    reciboId?: string | null;
    sourceReciboId?: string | null;
    cashRegisterId?: string | null;
  },
  tx: Prisma.TransactionClient
) {
  const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
  const fiscalMode = (p.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
  const account = await caRepo.findByCustomerId(p.customerId, p.currency as Currency, fiscalMode)
    ?? await caRepo.createForCustomer(p.customerId, p.currency as Currency, undefined, fiscalMode, tx);
  const movement = await caRepo.addMovement({
    currentAccountId: account.id,
    type: p.type,
    amount: p.amount,
    description: p.description,
    invoiceId: p.invoiceId ?? undefined,
    reciboId: p.reciboId ?? undefined,
    cashRegisterId: p.cashRegisterId ?? undefined,
  }, tx);
  if (p.sourceReciboId) {
    await tx.$executeRaw`UPDATE "account_movements" SET "sourceReciboId" = ${p.sourceReciboId} WHERE id = ${movement.id}`;
  }
  return movement;
}
