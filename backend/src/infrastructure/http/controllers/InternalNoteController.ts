import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { container } from 'tsyringe';
import { IInternalNoteRepository } from '../../../domain/repositories/IInternalNoteRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { ISupplierRepository } from '../../../domain/repositories/ISupplierRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { createInternalNote, cancelInternalNote } from '../../services/InternalNoteService';

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
      const note = await repo.findById(req.params.id, req.companyId);
      if (!note) throw new NotFoundError('Nota interna');
      res.json({ status: 'success', data: note });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerRepo = container.resolve<ICustomerRepository>('CustomerRepository');
      const supplierRepo = container.resolve<ISupplierRepository>('SupplierRepository');

      const data = createSchema.parse(req.body);

      if (data.customerId) {
        const customer = await customerRepo.findById(data.customerId, req.companyId);
        if (!customer) throw new NotFoundError('Cliente');
      } else if (data.supplierId) {
        const supplier = await supplierRepo.findById(data.supplierId, req.companyId);
        if (!supplier) throw new NotFoundError('Proveedor');
      }

      const note = await createInternalNote({
        type:       data.type,
        customerId: data.customerId ?? null,
        supplierId: data.supplierId ?? null,
        userId:     req.user!.userId,
        companyId:  req.companyId!,
        currency:   data.currency,
        amount:     data.amount,
        reason:     data.reason,
        notes:      data.notes ?? null,
        fiscalMode: req.fiscalMode,
      });

      res.status(201).json({ status: 'success', data: note });
    } catch (error) { next(error); }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IInternalNoteRepository>('InternalNoteRepository');
      const note = await repo.findById(req.params.id, req.companyId);
      if (!note) throw new NotFoundError('Nota interna');
      const cancelled = await cancelInternalNote(note);
      res.json({ status: 'success', data: cancelled });
    } catch (error) { next(error); }
  }
}
