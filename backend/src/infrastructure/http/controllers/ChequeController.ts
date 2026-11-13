import { assertBankAccountInCompany } from '../utils/tenantRefs';
import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IChequeRepository } from '../../../domain/repositories/IChequeRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { recordChequeBounceMovement, ChequeBounceResult } from '../../services/ChequeBounceService';
import prisma from '../../database/prisma';

const createChequeSchema = z.object({
  type:           z.enum(['INGRESO', 'EGRESO']),
  checkNumber:    z.string().optional(),
  bank:           z.string().optional(),
  amount:         z.number().positive('El monto debe ser positivo'),
  currency:       z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate:   z.number().positive().default(1),
  dueDate:        z.string().optional(),
  issuer:         z.string().optional(),
  beneficiary:    z.string().optional(),
  notes:          z.string().optional(),
  customerId:     z.string().uuid().optional().nullable(),
  supplierId:     z.string().uuid().optional().nullable(),
  bankAccountId:  z.string().uuid().optional().nullable(),
  cashRegisterId: z.string().uuid().optional().nullable(),
  chequeraId:     z.string().uuid().optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED', 'ENDOSADO']),
  bankAccountId: z.string().uuid().optional(),
  // Al rechazar: cómo se documenta el débito (nota interna o Nota de Débito).
  bounceMode:      z.enum(['INTERNAL_NOTE', 'DEBIT_NOTE']).optional(),
  debitNoteNumber: z.string().trim().max(50).optional().nullable(),
  debitNoteLetter: z.enum(['A', 'B', 'C']).optional().nullable(),
});

// Máquina de transiciones del cheque — espejo server-side de
// CHEQUE_NEXT_STATUSES en frontend/src/types/cheque.types.ts: lo que la UI
// no ofrece, la API tampoco acepta. CLEARED es terminal; ENDOSADO se gestiona
// vía la Orden de Pago (no por este endpoint); BOUNCED/RETURNED pueden volver
// a cartera (la reversión del débito por rechazo la maneja el bounce service).
const CHEQUE_TRANSITIONS: Record<string, string[]> = {
  PENDING:   ['DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED'],
  DEPOSITED: ['CLEARED', 'BOUNCED'],
  CLEARED:   [],
  BOUNCED:   ['PENDING'],
  RETURNED:  ['PENDING'],
  ENDOSADO:  [],
  // Egresado de cartera: vuelve solo anulando el egreso (/cheques/egresos/:id/cancel).
  EGRESADO:  [],
};

const CHEQUE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En cartera',
  DEPOSITED: 'Depositado',
  CLEARED: 'Acreditado',
  BOUNCED: 'Rechazado',
  RETURNED: 'Devuelto',
  ENDOSADO: 'Endosado',
  EGRESADO: 'Egresado',
};

const listQuerySchema = z.object({
  page:       z.coerce.number().int().positive().optional(),
  limit:      z.coerce.number().int().positive().max(200).optional(),
  type:       z.enum(['INGRESO', 'EGRESO']).optional(),
  status:     z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED', 'ENDOSADO', 'EGRESADO']).optional(),
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  chequeraId: z.string().uuid().optional(),
  search:     z.string().trim().max(100).optional(),   // N° de cheque o número interno
});

export class ChequeController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeRepository>('ChequeRepository');
      const { page, limit, type, status, customerId, supplierId, chequeraId, search } = listQuerySchema.parse(req.query);
      const result = await repo.findAll({
        companyId:   req.companyId!,
        type,
        status,
        customerId,
        supplierId,
        chequeraId,
        search:      search || undefined,
        fiscalMode:  req.fiscalMode,
        page:  page  ?? 1,
        limit: limit ?? 50,
      });
      res.json({ status: 'success', data: result.data, total: result.total });
    } catch (err) { next(err); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo   = container.resolve<IChequeRepository>('ChequeRepository');
      const cheque = await repo.findById(req.params.id, req.companyId!);
      if (!cheque) throw new NotFoundError('Cheque');
      res.json({ status: 'success', data: cheque });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo   = container.resolve<IChequeRepository>('ChequeRepository');
      const data   = createChequeSchema.parse(req.body);
      await assertBankAccountInCompany(data.bankAccountId, req.companyId);
      const cheque = await repo.create({
        ...data,
        customerId:     data.customerId  ?? undefined,
        supplierId:     data.supplierId  ?? undefined,
        bankAccountId:  data.bankAccountId  ?? undefined,
        cashRegisterId: data.cashRegisterId ?? undefined,
        chequeraId:     data.chequeraId ?? undefined,
        userId:    req.user!.userId,
        companyId: req.companyId!,
        fiscalMode: req.fiscalMode || 'FORMAL',
      });
      res.status(201).json({ status: 'success', data: cheque });
    } catch (err) { next(err); }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo   = container.resolve<IChequeRepository>('ChequeRepository');
      const { status, bankAccountId, bounceMode, debitNoteNumber, debitNoteLetter } = updateStatusSchema.parse(req.body);

      const existing = await repo.findById(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Cheque');
      const oldStatus = existing.status;

      if (!(CHEQUE_TRANSITIONS[oldStatus] ?? []).includes(status)) {
        const from = CHEQUE_STATUS_LABELS[oldStatus] ?? oldStatus;
        const to = CHEQUE_STATUS_LABELS[status] ?? status;
        const allowed = (CHEQUE_TRANSITIONS[oldStatus] ?? [])
          .map((s) => CHEQUE_STATUS_LABELS[s] ?? s)
          .join(', ');
        throw new AppError(
          `Transición de estado inválida (${from} → ${to}).${allowed ? ` Desde ${from} solo se puede pasar a: ${allowed}.` : ` ${from} es un estado final.`}`,
          400
        );
      }

      // Al depositar se puede indicar (o corregir) la cuenta bancaria destino.
      if (status === 'DEPOSITED' && bankAccountId) {
        await assertBankAccountInCompany(bankAccountId, req.companyId);
        await prisma.$executeRaw`
          UPDATE "cheques" SET "bankAccountId" = ${bankAccountId}, "updatedAt" = NOW()
          WHERE id = ${req.params.id} AND "companyId" = ${req.companyId!}
        `;
      }

      // Débito al cliente/proveedor cuando el cheque se rechaza (nota interna o
      // Nota de Débito, a elección del usuario) y reversión si vuelve atrás.
      // Va ANTES del cambio de estado: si el débito falla (p.ej. falta el número
      // de la ND, o hay una ND sin anular) el cheque queda como estaba.
      const enteringBounced = status === 'BOUNCED' && oldStatus !== 'BOUNCED';
      const leavingBounced  = oldStatus === 'BOUNCED' && status !== 'BOUNCED';
      let bounce: ChequeBounceResult | null = null;
      if (enteringBounced || leavingBounced) {
        bounce = await recordChequeBounceMovement({
          customerId:   existing.customerId,
          supplierId:   existing.supplierId,
          amount:       Number(existing.amount),
          currency:     existing.currency,
          exchangeRate: Number((existing as any).exchangeRate ?? 1),
          reference:    existing.checkNumber || existing.number,
          direction:    enteringBounced ? 'DEBIT' : 'CREDIT',
          companyId:    req.companyId!,
          userId:       req.user!.userId,
          fiscalMode:   existing.fiscalMode,
          mode:         bounceMode ?? 'INTERNAL_NOTE',
          debitNoteNumber,
          debitNoteLetter,
        });
      }

      const cheque = await repo.updateStatus(req.params.id, status, req.companyId!);

      if (enteringBounced) {
        const doc = bounce?.kind === 'SALES_DEBIT_NOTE' || bounce?.kind === 'PURCHASE_DEBIT_NOTE'
          ? `Nota de Débito ${bounce.number}`
          : 'débito interno';
        container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
          userId: req.user!.userId,
          action: 'UPDATE',
          entity: 'Cheque',
          entityId: cheque.id,
          description: `Cheque ${cheque.checkNumber || cheque.number} rechazado — ${doc} a ${cheque.customer?.name ?? cheque.supplier?.name ?? 'cuenta'}`,
        }).catch(() => { /* log no crítico */ });
      }

      res.json({ status: 'success', data: cheque, bounce });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo   = container.resolve<IChequeRepository>('ChequeRepository');
      const cheque = await repo.findById(req.params.id, req.companyId!);
      if (!cheque) throw new NotFoundError('Cheque');
      await repo.delete(req.params.id, req.companyId!);
      res.status(204).send();
    } catch (err) { next(err); }
  }
}
