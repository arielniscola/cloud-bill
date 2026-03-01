import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { updateAppSettingsSchema } from '../../../application/dtos/appSettings.dto';

export class AppSettingsController {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const settings = await repo.get();
      res.json({ status: 'success', data: settings ?? { id: 'default', defaultBudgetCashRegisterId: null, defaultInvoiceCashRegisterId: null, deadStockDays: 90, safetyStockDays: 14 } });
    } catch (error) {
      next(error);
    }
  }

  async upsert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const data = updateAppSettingsSchema.parse(req.body);
      const settings = await repo.upsert(data);
      res.json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  }
}
