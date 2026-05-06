import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IOrdenPagoRepository } from '../../../domain/repositories/IOrdenPagoRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { createOrdenPagoSchema, ordenPagoQuerySchema } from '../../../application/dtos/ordenPago.dto';
import { recordSupplierPayment, recordSupplierPaymentReversal } from '../../services/AccountingService';
import prisma from '../../database/prisma';
import { Prisma } from '@prisma/client';

export class OrdenPagoController {

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const query = ordenPagoQuerySchema.parse(req.query);

      const result = await repo.findAll(
        { page: query.page, limit: query.limit },
        {
          supplierId:    query.supplierId,
          status:        query.status,
          paymentMethod: query.paymentMethod,
          companyId:     req.companyId,
          fiscalMode:    req.fiscalMode,
          dateFrom:      query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo:        query.dateTo   ? new Date(query.dateTo)   : undefined,
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('OrdenPago');
      res.json({ status: 'success', data: op });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const body = createOrdenPagoSchema.parse(req.body);

      const op = await repo.create({
        supplierId:     body.supplierId,
        userId:         req.user!.userId,
        cashRegisterId: body.cashRegisterId,
        companyId:      req.companyId,
        fiscalMode:     req.fiscalMode,
        date:           body.date ? new Date(body.date) : undefined,
        currency:       body.currency as any,
        exchangeRate:   body.exchangeRate,
        paymentMethod:  body.paymentMethod as any,
        reference:      body.reference,
        bank:           body.bank,
        checkDueDate:   body.checkDueDate ? new Date(body.checkDueDate) : undefined,
        notes:          body.notes,
        items:          body.items,
      } as any);

      await activityLogRepo.create({
        userId:      req.user!.userId,
        action:      'CREATE',
        entity:      'OrdenPago',
        entityId:    op.id,
        description: `Orden de Pago ${op.number} emitida por $${Number(op.amount).toLocaleString('es-AR')}`,
        metadata:    { supplierId: op.supplierId, amount: Number(op.amount), paymentMethod: op.paymentMethod },
      });

      res.status(201).json({ status: 'success', data: op });
    } catch (error) {
      next(error);
    }
  }

  async pay(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('OrdenPago');

      if (op.status === 'PAID') throw new AppError('La orden de pago ya está pagada', 400);
      if (op.status === 'CANCELLED') throw new AppError('No se puede pagar una orden cancelada', 400);

      const paid = await repo.pay(req.params.id);

      // Fetch retenciones from all linked purchase_invoices to discriminate them in the journal entry
      const invoiceIds = [...new Set(paid.items.map((i) => i.purchaseInvoiceId).filter(Boolean) as string[])];
      let retenciones: { type: string; amount: number }[] = [];
      if (invoiceIds.length > 0) {
        const rows = await prisma.$queryRaw<{ type: string; amount: any }[]>`
          SELECT type, amount
          FROM "purchase_invoice_retenciones"
          WHERE "purchaseInvoiceId" IN (${Prisma.join(invoiceIds)})
        `;
        retenciones = rows.map((r) => ({ type: r.type, amount: Number(r.amount) }));
      }

      await recordSupplierPayment({
        id:            paid.id,
        number:        paid.number,
        amount:        Number(paid.amount),
        paymentMethod: paid.paymentMethod,
        companyId:     req.companyId!,
        userId:        req.user!.userId,
        supplierName:  paid.supplier?.name,
        retenciones,
      });

      await activityLogRepo.create({
        userId:      req.user!.userId,
        action:      'UPDATE',
        entity:      'OrdenPago',
        entityId:    op.id,
        description: `Orden de Pago ${op.number} marcada como pagada`,
      });

      res.json({ status: 'success', data: paid });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const op = await repo.findById(req.params.id);
      if (!op) throw new NotFoundError('OrdenPago');

      if (op.status === 'CANCELLED') throw new AppError('La orden de pago ya está cancelada', 400);

      const wasPaid = op.status === 'PAID';
      const cancelled = await repo.cancel(req.params.id);

      // Reverse the journal entry only if the OP had been paid (otherwise no entry exists)
      if (wasPaid) {
        await recordSupplierPaymentReversal(
          op.id,
          op.number,
          req.companyId!,
          req.user!.userId,
        );
      }

      await activityLogRepo.create({
        userId:      req.user!.userId,
        action:      'CANCEL',
        entity:      'OrdenPago',
        entityId:    op.id,
        description: `Orden de Pago ${op.number} cancelada`,
      });

      res.json({ status: 'success', data: cancelled });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const { supplierId } = req.params;
      const { page, limit } = req.query;

      const [balance, movements] = await Promise.all([
        repo.getSupplierBalance(supplierId, req.companyId),
        repo.getSupplierMovements(
          supplierId,
          { page: Number(page) || 1, limit: Number(limit) || 20 },
          req.companyId
        ),
      ]);

      res.json({ status: 'success', data: { balance, ...movements } });
    } catch (error) {
      next(error);
    }
  }
}
