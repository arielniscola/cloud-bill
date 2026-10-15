import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { updateAppSettingsSchema } from '../../../application/dtos/appSettings.dto';

// Credenciales que el backend usa pero nunca devuelve: cualquier usuario
// autenticado lee la configuración. Al cliente le alcanza con saber si están.
const SECRET_FIELDS = ['smtpPass', 'mpAccessToken', 'mpWebhookSecret'] as const;

function withoutSecrets(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...settings };
  for (const field of SECRET_FIELDS) {
    out[`${field}Set`] = Boolean(out[field]);
    delete out[field];
  }
  return out;
}

export class AppSettingsController {
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const companyId = req.companyId ?? '00000000-0000-0000-0000-000000000001';
      const settings = await (repo as any).get(companyId);
      res.json({ status: 'success', data: withoutSecrets(settings ?? { id: companyId, defaultBudgetCashRegisterId: null, defaultInvoiceCashRegisterId: null, deadStockDays: 90, safetyStockDays: 14, stalePriceWarnDays1: 10, stalePriceWarnDays2: 20 }) });
    } catch (error) {
      next(error);
    }
  }

  async upsert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAppSettingsRepository>('AppSettingsRepository');
      const data = updateAppSettingsSchema.parse(req.body);
      // Como el cliente no recibe los secretos, un campo vacío significa "no lo
      // toqué": se conserva el guardado. Para borrarlo hay que mandar null.
      for (const field of SECRET_FIELDS) {
        if (data[field] === '') delete data[field];
      }
      const companyId = req.companyId ?? '00000000-0000-0000-0000-000000000001';
      const settings = await (repo as any).upsert(data, companyId);
      res.json({ status: 'success', data: withoutSecrets(settings) });
    } catch (error) {
      next(error);
    }
  }
}
