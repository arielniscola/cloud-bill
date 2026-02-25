import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IAfipConfigRepository } from '../../../domain/repositories/IAfipConfigRepository';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { afipService } from '../../services/AfipService';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';

export class AfipController {
  async getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAfipConfigRepository>('AfipConfigRepository');
      const config = await repo.getActive();

      if (!config) {
        res.json({ status: 'success', data: null });
        return;
      }

      // Never send private key and cert back to the frontend in full
      res.json({
        status: 'success',
        data: {
          id: config.id,
          cuit: config.cuit,
          salePoint: config.salePoint,
          isProduction: config.isProduction,
          isActive: config.isActive,
          hasCert: config.cert.length > 0,
          hasKey: config.privateKey.length > 0,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async saveConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAfipConfigRepository>('AfipConfigRepository');
      const { cuit, salePoint, cert, privateKey, isProduction } = req.body;

      const config = await repo.upsert({ cuit, salePoint: Number(salePoint), cert, privateKey, isProduction: Boolean(isProduction) });

      res.json({
        status: 'success',
        data: {
          id: config.id,
          cuit: config.cuit,
          salePoint: config.salePoint,
          isProduction: config.isProduction,
          isActive: config.isActive,
          hasCert: config.cert.length > 0,
          hasKey: config.privateKey.length > 0,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async testConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAfipConfigRepository>('AfipConfigRepository');
      const config = await repo.getActive();

      if (!config) {
        throw new AppError('No hay configuración AFIP activa', 400);
      }

      const result = await afipService.testConnection(config);
      res.json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  async emitInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const afipRepo = container.resolve<IAfipConfigRepository>('AfipConfigRepository');
      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');

      const invoice = await invoiceRepo.findById(req.params.id);
      if (!invoice) throw new NotFoundError('Invoice');

      if (invoice.status !== 'DRAFT') {
        throw new AppError('Solo se pueden emitir facturas en estado DRAFT', 400);
      }

      if (invoice.cae) {
        throw new AppError('Esta factura ya tiene CAE asignado', 400);
      }

      const config = await afipRepo.getActive();
      if (!config) {
        throw new AppError('No hay configuración AFIP activa. Configure ARCA en Configuración.', 400);
      }

      const result = await afipService.emitInvoice(invoice as any, config);

      const updated = await invoiceRepo.update(req.params.id, {
        cae: result.cae,
        caeExpiry: result.caeExpiry,
        afipCbtNum: result.afipCbtNum,
        afipPtVenta: result.afipPtVenta,
        status: 'ISSUED',
      });

      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'AfipEmission',
        entityId: invoice.id,
        description: `CAE emitido para factura ${invoice.number}: ${result.cae}`,
        metadata: { cae: result.cae, caeExpiry: result.caeExpiry, afipCbtNum: result.afipCbtNum },
      });

      res.json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }
}
