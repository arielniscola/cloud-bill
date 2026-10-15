import { container } from 'tsyringe';
import { IInternalNoteRepository } from '../../domain/repositories/IInternalNoteRepository';
import { ICurrentAccountRepository } from '../../domain/repositories/ICurrentAccountRepository';
import { IOrdenPagoRepository } from '../../domain/repositories/IOrdenPagoRepository';
import { InternalNote } from '../../domain/entities/InternalNote';
import { AppError } from '../../shared/errors/AppError';
import { Currency } from '../../shared/types';
import prisma from '../database/prisma';

export interface CreateInternalNoteParams {
  type: 'DEBIT' | 'CREDIT';
  customerId?: string | null;
  supplierId?: string | null;
  userId: string;
  companyId: string;
  currency: string;
  amount: number;
  reason: string;
  notes?: string | null;
  fiscalMode?: string;
}

/**
 * Alta de una nota interna (ND / NC sin comprobante fiscal) con su movimiento
 * en la cuenta corriente del cliente o del proveedor. El movimiento queda
 * marcado con `internalNoteId`: es lo que lo vuelve imputable (crédito que se
 * aplica a facturas, o débito que se cancela contra un crédito).
 */
export async function createInternalNote(p: CreateInternalNoteParams): Promise<InternalNote> {
  const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
  const note = await repo.create({
    type: p.type,
    customerId: p.customerId ?? null,
    supplierId: p.supplierId ?? null,
    userId: p.userId,
    companyId: p.companyId,
    currency: p.currency,
    amount: p.amount,
    reason: p.reason,
    notes: p.notes ?? null,
  } as any);
  const description = `${p.type === 'DEBIT' ? 'ND interna' : 'NC interna'}: ${p.reason} (${note.number})`;

  if (p.customerId) {
    const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
    let account = await caRepo.findByCustomerId(p.customerId, p.currency as Currency, p.fiscalMode);
    if (!account) account = await caRepo.createForCustomer(p.customerId, p.currency as Currency, undefined, p.fiscalMode);
    const movement = await caRepo.addMovement({
      currentAccountId: account.id, type: p.type, amount: p.amount, description,
    } as any);
    if (movement?.id) {
      await prisma.$executeRaw`UPDATE "account_movements" SET "internalNoteId" = ${note.id} WHERE id = ${movement.id}`;
    }
  } else if (p.supplierId) {
    const opRepo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
    const movement = await opRepo.createSupplierMovement({
      supplierId: p.supplierId, type: p.type, amount: p.amount, currency: p.currency, description,
      companyId: p.companyId, fiscalMode: (p.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
    });
    if (movement?.id) {
      await prisma.$executeRaw`UPDATE "supplier_account_movements" SET "internalNoteId" = ${note.id} WHERE id = ${movement.id}`;
    }
  }
  return note;
}

/**
 * Anula una nota interna: revierte su movimiento y la marca CANCELLED.
 * Si la nota ya se imputó (recibo de compensación en clientes, ajuste de cuenta
 * corriente en proveedores) no se puede anular: primero hay que deshacer la
 * imputación, si no la factura quedaría cancelada contra un crédito inexistente.
 */
export async function cancelInternalNote(note: InternalNote): Promise<InternalNote> {
  const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
  if (note.status === 'CANCELLED') throw new AppError('La nota ya está cancelada', 400);
  const reversalType = note.type === 'DEBIT' ? 'CREDIT' : 'DEBIT';

  if (note.customerId) {
    const [movement] = await prisma.$queryRaw<{ id: string; currentAccountId: string }[]>`
      SELECT id, "currentAccountId" FROM "account_movements" WHERE "internalNoteId" = ${note.id} LIMIT 1
    `;
    if (movement) {
      const [used] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "recibos" WHERE "creditMovementId" = ${movement.id} AND status = 'EMITTED'
      `;
      if (used && used.n > 0) {
        throw new AppError('La nota ya se aplicó a facturas. Anulá primero los recibos de compensación que la usan.', 400);
      }
      const caRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      await caRepo.addMovement({
        currentAccountId: movement.currentAccountId,
        type: reversalType,
        amount: Number(note.amount),
        description: `Anulación nota interna ${note.number}`,
      } as any);
    }
  } else if (note.supplierId) {
    const [movement] = await prisma.$queryRaw<{ id: string; supplierId: string; currency: string; fiscalMode: string }[]>`
      SELECT id, "supplierId", currency, "fiscalMode" FROM "supplier_account_movements"
      WHERE "internalNoteId" = ${note.id} LIMIT 1
    `;
    if (movement) {
      const [used] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "supplier_cc_adjustment_items" WHERE "movementId" = ${movement.id}
      `;
      if (used && used.n > 0) {
        throw new AppError('La nota ya se imputó en la cuenta corriente del proveedor y no se puede anular.', 400);
      }
      const opRepo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      await opRepo.createSupplierMovement({
        supplierId: movement.supplierId,
        type: reversalType,
        amount: Number(note.amount),
        currency: movement.currency,
        description: `Anulación nota interna ${note.number}`,
        companyId: note.companyId,
        fiscalMode: (movement.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
      });
    }
  }

  return repo.cancel(note.id);
}
