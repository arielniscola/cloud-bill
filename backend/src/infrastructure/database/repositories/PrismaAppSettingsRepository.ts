import { injectable } from 'tsyringe';
import { IAppSettingsRepository } from '../../../domain/repositories/IAppSettingsRepository';
import { AppSettings, UpdateAppSettingsInput } from '../../../domain/entities/AppSettings';
import prisma from '../prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INCLUDE = {
  defaultBudgetCashRegister:  { select: { id: true, name: true } },
  defaultInvoiceCashRegister: { select: { id: true, name: true } },
} as any;

@injectable()
export class PrismaAppSettingsRepository implements IAppSettingsRepository {
  async get(): Promise<AppSettings | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prisma.appSettings as any).findUnique({
      where:   { id: 'default' },
      include: INCLUDE,
    }) as Promise<AppSettings | null>;
  }

  async upsert(data: UpdateAppSettingsInput): Promise<AppSettings> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prisma.appSettings as any).upsert({
      where:  { id: 'default' },
      update: {
        ...(data.defaultBudgetCashRegisterId  !== undefined && { defaultBudgetCashRegisterId:  data.defaultBudgetCashRegisterId }),
        ...(data.defaultInvoiceCashRegisterId !== undefined && { defaultInvoiceCashRegisterId: data.defaultInvoiceCashRegisterId }),
        ...(data.deadStockDays   !== undefined && { deadStockDays:   data.deadStockDays }),
        ...(data.safetyStockDays !== undefined && { safetyStockDays: data.safetyStockDays }),
      },
      create: {
        id:                          'default',
        defaultBudgetCashRegisterId:  data.defaultBudgetCashRegisterId  ?? null,
        defaultInvoiceCashRegisterId: data.defaultInvoiceCashRegisterId ?? null,
        deadStockDays:   data.deadStockDays   ?? 90,
        safetyStockDays: data.safetyStockDays ?? 14,
      },
      include: INCLUDE,
    }) as Promise<AppSettings>;
  }
}
