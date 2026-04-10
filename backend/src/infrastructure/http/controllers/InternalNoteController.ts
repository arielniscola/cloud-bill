import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { container } from 'tsyringe';
import { IInternalNoteRepository } from '../../../domain/repositories/IInternalNoteRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import prisma from '../../database/prisma';

const createSchema = z.object({
  type:       z.enum(['DEBIT', 'CREDIT']),
  customerId: z.string().uuid(),
  currency:   z.enum(['ARS', 'USD']).default('ARS'),
  amount:     z.coerce.number().positive('El monto debe ser positivo'),
  reason:     z.string().min(1, 'El motivo es requerido'),
  notes:      z.string().optional().nullable(),
});

export class InternalNoteController {

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const { page, limit, customerId, type, status, currency, dateFrom, dateTo } = req.query;

      const result = await repo.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 20 },
        {
          companyId:  req.companyId,
          customerId: customerId as string | undefined,
          type:       type       as string | undefined,
          status:     status     as string | undefined,
          currency:   currency   as string | undefined,
          dateFrom:   dateFrom   ? new Date(dateFrom as string) : undefined,
          dateTo:     dateTo     ? new Date(dateTo   as string) : undefined,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) { next(error); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const note = await repo.findById(req.params.id);
      if (!note) throw new NotFoundError('Nota interna');
      res.json({ status: 'success', data: note });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo            = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const customerRepo    = container.resolve<ICustomerRepository>('CustomerRepository');
      const currentAccRepo  = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');

      const data = createSchema.parse(req.body);

      const customer = await customerRepo.findById(data.customerId);
      if (!customer) throw new NotFoundError('Cliente');

      const note = await repo.create({
        ...data,
        userId:    req.user!.userId,
        companyId: req.companyId!,
        notes:     data.notes ?? null,
      });

      // Reflect in current account (DEBIT = customer owes more, CREDIT = customer owes less)
      let currentAccount = await currentAccRepo.findByCustomerId(data.customerId, data.currency as any);
      if (!currentAccount) {
        currentAccount = await currentAccRepo.createForCustomer(data.customerId, data.currency as any);
      }

      const movement = await currentAccRepo.addMovement({
        currentAccountId: currentAccount.id,
        type:             data.type,   // DEBIT | CREDIT maps directly
        amount:           data.amount,
        description:      `${data.type === 'DEBIT' ? 'ND interna' : 'NC interna'}: ${data.reason} (${note.number})`,
      } as any);

      // Link movement to the internal note
      if (movement?.id) {
        await prisma.$executeRaw`
          UPDATE "account_movements"
          SET "internalNoteId" = ${note.id}
          WHERE id = ${movement.id}
        `;
      }

      res.status(201).json({ status: 'success', data: note });
    } catch (error) { next(error); }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo           = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const currentAccRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');

      const note = await repo.findById(req.params.id);
      if (!note) throw new NotFoundError('Nota interna');
      if (note.companyId !== req.companyId) throw new NotFoundError('Nota interna');
      if (note.status === 'CANCELLED') throw new AppError('La nota ya está cancelada', 400);

      // Reverse the account movement
      const [movement] = await prisma.$queryRaw<{ id: string; currentAccountId: string }[]>`
        SELECT id, "currentAccountId" FROM "account_movements"
        WHERE "internalNoteId" = ${note.id}
        LIMIT 1
      `;

      if (movement) {
        const reversalType = note.type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        await currentAccRepo.addMovement({
          currentAccountId: movement.currentAccountId,
          type:             reversalType,
          amount:           note.amount,
          description:      `Anulación nota interna ${note.number}`,
        } as any);
      }

      const cancelled = await repo.cancel(note.id);
      res.json({ status: 'success', data: cancelled });
    } catch (error) { next(error); }
  }
}
