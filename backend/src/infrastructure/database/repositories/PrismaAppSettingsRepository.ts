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
    // Use $executeRaw to bypass stale Prisma client runtime validation on FK scalar fields
    const current = await this.get();

    const budgetCashRegisterId  = data.defaultBudgetCashRegisterId  !== undefined
      ? data.defaultBudgetCashRegisterId
      : (current?.defaultBudgetCashRegister?.id ?? null);
    const invoiceCashRegisterId = data.defaultInvoiceCashRegisterId !== undefined
      ? data.defaultInvoiceCashRegisterId
      : (current?.defaultInvoiceCashRegister?.id ?? null);

    const deadStockDays       = data.deadStockDays       ?? current?.deadStockDays       ?? 90;
    const safetyStockDays     = data.safetyStockDays     ?? current?.safetyStockDays     ?? 14;
    const stalePriceWarnDays1 = data.stalePriceWarnDays1 ?? current?.stalePriceWarnDays1 ?? 10;
    const stalePriceWarnDays2 = data.stalePriceWarnDays2 ?? current?.stalePriceWarnDays2 ?? 20;
    const companyTaxCondition = data.companyTaxCondition ?? current?.companyTaxCondition ?? 'RESPONSABLE_INSCRIPTO';
    const printFormat         = data.printFormat         ?? current?.printFormat         ?? 'A4';
    const smtpHost            = data.smtpHost   !== undefined ? data.smtpHost   : (current?.smtpHost   ?? null);
    const smtpPort            = data.smtpPort   ?? current?.smtpPort   ?? 587;
    const smtpUser            = data.smtpUser   !== undefined ? data.smtpUser   : (current?.smtpUser   ?? null);
    const smtpPass            = data.smtpPass   !== undefined ? data.smtpPass   : (current?.smtpPass   ?? null);
    const smtpFrom            = data.smtpFrom   !== undefined ? data.smtpFrom   : (current?.smtpFrom   ?? null);
    const smtpSecure          = data.smtpSecure ?? current?.smtpSecure ?? false;

    await prisma.$executeRaw`
      INSERT INTO "app_settings" (
        "id", "deadStockDays", "safetyStockDays", "stalePriceWarnDays1", "stalePriceWarnDays2",
        "companyTaxCondition", "printFormat",
        "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom", "smtpSecure",
        "defaultBudgetCashRegisterId", "defaultInvoiceCashRegisterId", "updatedAt"
      ) VALUES (
        'default',
        ${deadStockDays}, ${safetyStockDays}, ${stalePriceWarnDays1}, ${stalePriceWarnDays2},
        ${companyTaxCondition}, ${printFormat},
        ${smtpHost}, ${smtpPort}, ${smtpUser}, ${smtpPass}, ${smtpFrom}, ${smtpSecure},
        ${budgetCashRegisterId}, ${invoiceCashRegisterId}, NOW()
      )
      ON CONFLICT ("id") DO UPDATE SET
        "deadStockDays"                = EXCLUDED."deadStockDays",
        "safetyStockDays"              = EXCLUDED."safetyStockDays",
        "stalePriceWarnDays1"          = EXCLUDED."stalePriceWarnDays1",
        "stalePriceWarnDays2"          = EXCLUDED."stalePriceWarnDays2",
        "companyTaxCondition"          = EXCLUDED."companyTaxCondition",
        "printFormat"                  = EXCLUDED."printFormat",
        "smtpHost"                     = EXCLUDED."smtpHost",
        "smtpPort"                     = EXCLUDED."smtpPort",
        "smtpUser"                     = EXCLUDED."smtpUser",
        "smtpPass"                     = EXCLUDED."smtpPass",
        "smtpFrom"                     = EXCLUDED."smtpFrom",
        "smtpSecure"                   = EXCLUDED."smtpSecure",
        "defaultBudgetCashRegisterId"  = EXCLUDED."defaultBudgetCashRegisterId",
        "defaultInvoiceCashRegisterId" = EXCLUDED."defaultInvoiceCashRegisterId",
        "updatedAt"                    = NOW()
    `;

    return (await this.get())!;
  }
}
