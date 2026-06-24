import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IChequeRepository } from '../../../domain/repositories/IChequeRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { recordChequeBounceMovement } from '../../services/ChequeBounceService';

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
});

const listQuerySchema = z.object({
  page:       z.coerce.number().int().positive().optional(),
  limit:      z.coerce.number().int().positive().max(200).optional(),
  type:       z.enum(['INGRESO', 'EGRESO']).optional(),
  status:     z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED', 'ENDOSADO']).optional(),
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});

export class ChequeController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeRepository>('ChequeRepository');
      const { page, limit, type, status, customerId, supplierId } = listQuerySchema.parse(req.query);
      const result = await repo.findAll({
        companyId:   req.companyId!,
        type,
        status,
        customerId,
        supplierId,
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
      const { status } = updateStatusSchema.parse(req.body);

      const existing = await repo.findById(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Cheque');
      const oldStatus = existing.status;

      const cheque = await repo.updateStatus(req.params.id, status, req.companyId!);

      // Débito interno al cliente/proveedor cuando el cheque se rechaza
      // (y reversión si se vuelve atrás desde Rechazado).
      const enteringBounced = status === 'BOUNCED' && oldStatus !== 'BOUNCED';
      const leavingBounced  = oldStatus === 'BOUNCED' && status !== 'BOUNCED';
      if (enteringBounced || leavingBounced) {
        await recordChequeBounceMovement({
          customerId: cheque.customerId,
          supplierId: cheque.supplierId,
          amount:     Number(cheque.amount),
          currency:   cheque.currency,
          reference:  cheque.checkNumber || cheque.number,
          direction:  enteringBounced ? 'DEBIT' : 'CREDIT',
          companyId:  req.companyId!,
          fiscalMode: cheque.fiscalMode,
        });
        if (enteringBounced) {
          container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
            userId: req.user!.userId,
            action: 'UPDATE',
            entity: 'Cheque',
            entityId: cheque.id,
            description: `Cheque ${cheque.checkNumber || cheque.number} rechazado — débito a ${cheque.customer?.name ?? cheque.supplier?.name ?? 'cuenta'}`,
          }).catch(() => { /* log no crítico */ });
        }
      }

      res.json({ status: 'success', data: cheque });
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
