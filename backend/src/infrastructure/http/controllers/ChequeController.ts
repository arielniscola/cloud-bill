import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IChequeRepository } from '../../../domain/repositories/IChequeRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

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
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED']),
});

export class ChequeController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeRepository>('ChequeRepository');
      const { page, limit, type, status, customerId, supplierId } = req.query as Record<string, string>;
      const result = await repo.findAll({
        companyId:   req.companyId!,
        type,
        status,
        customerId,
        supplierId,
        fiscalMode:  req.fiscalMode,
        page:  page  ? Number(page)  : 1,
        limit: limit ? Number(limit) : 50,
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
      const cheque = await repo.updateStatus(req.params.id, status, req.companyId!);
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
