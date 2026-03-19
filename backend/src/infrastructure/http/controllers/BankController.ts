import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IBankRepository } from '../../../domain/repositories/IBankRepository';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';

const createAccountSchema = z.object({
  name:          z.string().min(1),
  bank:          z.string().min(1),
  accountNumber: z.string().optional().nullable(),
  currency:      z.enum(['ARS', 'USD']).default('ARS'),
});

const updateAccountSchema = createAccountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const addMovementSchema = z.object({
  type:        z.enum(['CREDIT', 'DEBIT']),
  amount:      z.number().positive(),
  description: z.string().min(1),
  date:        z.string().optional(),
});

export class BankController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const accounts = await repo.findAllAccounts(req.companyId!);
      res.json({ status: 'success', data: accounts });
    } catch (error) { next(error); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const account = await repo.findAccountById(req.params.id);
      if (!account) throw new NotFoundError('Cuenta bancaria');
      res.json({ status: 'success', data: account });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const data = createAccountSchema.parse(req.body);
      const account = await repo.createAccount({ ...data, companyId: req.companyId! });
      res.status(201).json({ status: 'success', data: account });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const existing = await repo.findAccountById(req.params.id);
      if (!existing) throw new NotFoundError('Cuenta bancaria');
      const data = updateAccountSchema.parse(req.body);
      const account = await repo.updateAccount(req.params.id, data);
      res.json({ status: 'success', data: account });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const existing = await repo.findAccountById(req.params.id);
      if (!existing) throw new NotFoundError('Cuenta bancaria');
      await repo.deleteAccount(req.params.id);
      res.json({ status: 'success' });
    } catch (error) { next(error); }
  }

  async getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const account = await repo.findAccountById(req.params.id);
      if (!account) throw new NotFoundError('Cuenta bancaria');
      const page  = Number(req.query.page)  || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await repo.getMovements(req.params.id, { page, limit });
      res.json({ status: 'success', ...result });
    } catch (error) { next(error); }
  }

  async addMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IBankRepository>('BankRepository');
      const account = await repo.findAccountById(req.params.id);
      if (!account) throw new NotFoundError('Cuenta bancaria');
      const data = addMovementSchema.parse(req.body);
      const movement = await repo.addMovement({
        bankAccountId: req.params.id,
        type:          data.type,
        amount:        data.amount,
        description:   data.description,
        date:          data.date ? new Date(data.date) : undefined,
        companyId:     req.companyId!,
      });
      res.status(201).json({ status: 'success', data: movement });
    } catch (error) { next(error); }
  }

  /** Deposit a received check (recibo) to this bank account */
  async depositCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bankRepo   = container.resolve<IBankRepository>('BankRepository');
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const logRepo    = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const recibo = await reciboRepo.findById(req.params.reciboId);
      if (!recibo) throw new NotFoundError('Recibo');
      if ((recibo as any).paymentMethod !== 'CHECK') throw new AppError('El recibo no es de tipo cheque', 400);
      if ((recibo as any).status === 'CANCELLED')    throw new AppError('El recibo está cancelado', 400);
      if ((recibo as any).checkStatus === 'CLEARED') throw new AppError('El cheque ya fue acreditado', 400);

      const account = await bankRepo.findAccountById(req.params.id);
      if (!account) throw new NotFoundError('Cuenta bancaria');

      await bankRepo.addMovement({
        bankAccountId: req.params.id,
        type:          'CREDIT',
        amount:        Number((recibo as any).amount),
        description:   `Depósito cheque ${(recibo as any).number}`,
        reciboId:      recibo.id,
        companyId:     req.companyId!,
      });

      await reciboRepo.updateCheckStatus(recibo.id, 'DEPOSITED');

      await logRepo.create({
        userId:      req.user!.userId,
        action:      'UPDATE',
        entity:      'Recibo',
        entityId:    recibo.id,
        description: `Cheque ${(recibo as any).number} depositado en cuenta ${account.name}`,
      });

      res.json({ status: 'success' });
    } catch (error) { next(error); }
  }
}
