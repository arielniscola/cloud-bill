import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IOrdenPagoRepository } from '../../../domain/repositories/IOrdenPagoRepository';
import { SupplierMovementFilters } from '../../../domain/entities/SupplierAccountMovement';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { createOrdenPagoSchema, ordenPagoQuerySchema, createSupplierCcAdjustmentSchema } from '../../../application/dtos/ordenPago.dto';
import { recordSupplierPayment, recordSupplierPaymentReversal } from '../../services/AccountingService';

export class OrdenPagoController {

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const query = ordenPagoQuerySchema.parse(req.query);

      // `dateTo` llega como día suelto (YYYY-MM-DD) y `op.date` es un timestamp:
      // sin llevarlo al final del día, filtrar "hasta hoy" dejaba afuera todo lo
      // cargado hoy después de medianoche. El corte va en UTC, igual que
      // `dateFrom` (que se parsea como medianoche UTC).
      const dateTo = query.dateTo
        ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo) ? `${query.dateTo}T23:59:59.999Z` : query.dateTo)
        : undefined;

      const filters = {
        supplierId:     query.supplierId,
        status:         query.status,
        paymentMethod:  query.paymentMethod,
        currency:       query.currency,
        search:         query.search,
        onlyRetentions: query.onlyRetentions,
        onlyOnAccount:  query.onlyOnAccount,
        companyId:      req.companyId,
        fiscalMode:     req.fiscalMode,
        dateFrom:       query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo,
      };

      const [result, summary] = await Promise.all([
        repo.findAll({ page: query.page, limit: query.limit }, filters),
        repo.getSummary(filters),
      ]);

      res.json({ status: 'success', ...result, summary });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const op = await repo.findById(req.params.id, req.companyId);
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
        amount:         body.amount,
        ajustes:        body.ajustes,
        retenciones:    body.retenciones,
        chequesEnCartera: body.chequesEnCartera,
        chequesPropios:   body.chequesPropios,
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

      const op = await repo.findById(req.params.id, req.companyId);
      if (!op) throw new NotFoundError('OrdenPago');

      if (op.status === 'PAID') throw new AppError('La orden de pago ya está pagada', 400);
      if (op.status === 'CANCELLED') throw new AppError('No se puede pagar una orden cancelada', 400);

      const paid = await repo.pay(req.params.id);

      // Retenciones practicadas en el propio pago: ya están descontadas del
      // egreso (`amount` es el bruto imputado), así que el asiento acredita el
      // neto contra caja/banco y cada retención contra su cuenta de pasivo.
      const retenciones = (paid.retenciones ?? []).map((r) => ({ type: r.type, amount: Number(r.amount) }));
      const netCash = Number(paid.amount) - Number(paid.retentionAmount ?? 0);

      await recordSupplierPayment({
        id:            paid.id,
        number:        paid.number,
        amount:        netCash,
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

      const op = await repo.findById(req.params.id, req.companyId);
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
      const { page, limit, type, kinds, currency, dateFrom, dateTo, search } = req.query;

      const filters: SupplierMovementFilters = {
        type: type === 'DEBIT' || type === 'CREDIT' ? type : undefined,
        kinds: typeof kinds === 'string' && kinds.length > 0
          ? (kinds.split(',') as any[])
          : undefined,
        currency: currency === 'ARS' || currency === 'USD' ? currency : undefined,
        dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' ? dateTo : undefined,
        search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
      };

      const [balance, movements] = await Promise.all([
        repo.getSupplierBalance(supplierId, req.companyId, req.fiscalMode),
        repo.getSupplierMovements(
          supplierId,
          { page: Number(page) || 1, limit: Number(limit) || 20 },
          req.companyId,
          filters,
          req.fiscalMode
        ),
      ]);

      res.json({ status: 'success', data: { balance, ...movements } });
    } catch (error) {
      next(error);
    }
  }

  async getOpenItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const { supplierId } = req.params;
      const data = await repo.getOpenAccountItems(supplierId, req.companyId);
      res.json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  async createAdjustment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IOrdenPagoRepository>('OrdenPagoRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const { supplierId } = req.params;
      const body = createSupplierCcAdjustmentSchema.parse(req.body);

      const adjustment = await repo.createCcAdjustment({
        supplierId,
        companyId:   req.companyId!,
        fiscalMode:  req.fiscalMode as 'FORMAL' | 'INFORMAL' | undefined,
        currency:    body.currency,
        userId:      req.user!.userId,
        description: body.description,
        debits:      body.debits,
        credits:     body.credits,
        manualAmount: body.manualAmount,
      });

      await activityLogRepo.create({
        userId:      req.user!.userId,
        action:      'CREATE',
        entity:      'SupplierCcAdjustment',
        entityId:    adjustment.id,
        description: `Ajuste de cuenta corriente para proveedor ${supplierId}`,
        metadata:    { supplierId, manualAmount: Number(adjustment.manualAmount) },
      });

      res.status(201).json({ status: 'success', data: adjustment });
    } catch (error) {
      next(error);
    }
  }
}
