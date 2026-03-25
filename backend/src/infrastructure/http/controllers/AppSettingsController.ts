import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { updateAppSettingsSchema } from '../../../application/dtos/appSettings.dto';

export class AppSettingsController {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const companyId = req.companyId ?? '00000000-0000-0000-0000-000000000001';
      const settings = await (repo as any).get(companyId);
      res.json({ status: 'success', data: settings ?? { id: companyId, defaultBudgetCashRegisterId: null, defaultInvoiceCashRegisterId: null, deadStockDays: 90, safetyStockDays: 14, stalePriceWarnDays1: 10, stalePriceWarnDays2: 20 } });
    } catch (error) {
      next(error);
    }
  }

  async upsert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const data = updateAppSettingsSchema.parse(req.body);
      const companyId = req.companyId ?? '00000000-0000-0000-0000-000000000001';
      const settings = await (repo as any).upsert(data, companyId);
      res.json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  }
}
