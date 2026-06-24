import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { container } from 'tsyringe';
import { IInternalNoteRepository } from '../../../domain/repositories/IInternalNoteRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { ISupplierRepository } from '../../../domain/repositories/ISupplierRepository';
import { IOrdenPagoRepository } from '../../../domain/repositories/IOrdenPagoRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import prisma from '../../database/prisma';

const createSchema = z.object({
  type:       z.enum(['DEBIT', 'CREDIT']),
  customerId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  currency:   z.enum(['ARS', 'USD']).default('ARS'),
  amount:     z.coerce.number().positive('El monto debe ser positivo'),
  reason:     z.string().min(1, 'El motivo es requerido'),
  notes:      z.string().optional().nullable(),
}).refine(
  (d) => (!!d.customerId) !== (!!d.supplierId),
  { message: 'Debe indicar exactamente uno: cliente o proveedor' }
);

export class InternalNoteController {

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const { page, limit, customerId, supplierId, entity, type, status, currency, dateFrom, dateTo } = req.query;

      const result = await repo.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 20 },
        {
          companyId:  req.companyId,
          customerId: customerId as string | undefined,
          supplierId: supplierId as string | undefined,
          entity:     entity === 'CUSTOMER' || entity === 'SUPPLIER' ? entity : undefined,
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
      const repo           = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const customerRepo   = container.resolve<ICustomerRepository>('CustomerRepository');
      const supplierRepo   = container.resolve<ISupplierRepository>('SupplierRepository');
      const currentAccRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const ordenPagoRepo  = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');

      const data = createSchema.parse(req.body);

      if (data.customerId) {
        const customer = await customerRepo.findById(data.customerId);
        if (!customer) throw new NotFoundError('Cliente');
      } else if (data.supplierId) {
        const supplier = await supplierRepo.findById(data.supplierId);
        if (!supplier) throw new NotFoundError('Proveedor');
      }

      const note = await repo.create({
        type:       data.type,
        customerId: data.customerId ?? null,
        supplierId: data.supplierId ?? null,
        userId:     req.user!.userId,
        companyId:  req.companyId!,
        currency:   data.currency,
        amount:     data.amount,
        reason:     data.reason,
        notes:      data.notes ?? null,
      });

      if (data.customerId) {
        // Customer current account (DEBIT = customer owes more, CREDIT = less)
        let currentAccount = await currentAccRepo.findByCustomerId(data.customerId, data.currency as any, req.fiscalMode);
        if (!currentAccount) {
          currentAccount = await currentAccRepo.createForCustomer(data.customerId, data.currency as any, undefined, req.fiscalMode);
        }

        const movement = await currentAccRepo.addMovement({
          currentAccountId: currentAccount.id,
          type:             data.type,
          amount:           data.amount,
          description:      `${data.type === 'DEBIT' ? 'ND interna' : 'NC interna'}: ${data.reason} (${note.number})`,
        } as any);

        if (movement?.id) {
          await prisma.$executeRaw`
            UPDATE "account_movements"
            SET "internalNoteId" = ${note.id}
            WHERE id = ${movement.id}
          `;
        }
      } else if (data.supplierId) {
        // Supplier current account (DEBIT = owe supplier more, CREDIT = owe less)
        const movement = await ordenPagoRepo.createSupplierMovement({
          supplierId:  data.supplierId,
          type:        data.type,
          amount:      data.amount,
          currency:    data.currency,
          description: `${data.type === 'DEBIT' ? 'ND interna' : 'NC interna'}: ${data.reason} (${note.number})`,
          companyId:   req.companyId,
          fiscalMode:  req.fiscalMode,
        });

        if (movement?.id) {
          await prisma.$executeRaw`
            UPDATE "supplier_account_movements"
            SET "internalNoteId" = ${note.id}
            WHERE id = ${movement.id}
          `;
        }
      }

      res.status(201).json({ status: 'success', data: note });
    } catch (error) { next(error); }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo           = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const currentAccRepo = container.resolve<ICurrentAccountRepository>('CurrentAccountRepository');
      const ordenPagoRepo  = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');

      const note = await repo.findById(req.params.id);
      if (!note) throw new NotFoundError('Nota interna');
      if (note.companyId !== req.companyId) throw new NotFoundError('Nota interna');
      if (note.status === 'CANCELLED') throw new AppError('La nota ya está cancelada', 400);

      const reversalType = note.type === 'DEBIT' ? 'CREDIT' : 'DEBIT';

      if (note.customerId) {
        const [movement] = await prisma.$queryRaw<{ id: string; currentAccountId: string }[]>`
          SELECT id, "currentAccountId" FROM "account_movements"
          WHERE "internalNoteId" = ${note.id}
          LIMIT 1
        `;
        if (movement) {
          await currentAccRepo.addMovement({
            currentAccountId: movement.currentAccountId,
            type:             reversalType,
            amount:           note.amount,
            description:      `Anulación nota interna ${note.number}`,
          } as any);
        }
      } else if (note.supplierId) {
        const [movement] = await prisma.$queryRaw<{ id: string; supplierId: string; currency: string; fiscalMode: string }[]>`
          SELECT id, "supplierId", currency, "fiscalMode" FROM "supplier_account_movements"
          WHERE "internalNoteId" = ${note.id}
          LIMIT 1
        `;
        if (movement) {
          await ordenPagoRepo.createSupplierMovement({
            supplierId:  movement.supplierId,
            type:        reversalType,
            amount:      note.amount,
            currency:    movement.currency,
            description: `Anulación nota interna ${note.number}`,
            companyId:   note.companyId,
            fiscalMode:  (movement.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL',
          });
        }
      }

      const cancelled = await repo.cancel(note.id);
      res.json({ status: 'success', data: cancelled });
    } catch (error) { next(error); }
  }
}
