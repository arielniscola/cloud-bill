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
  async get(companyId = '00000000-0000-0000-0000-000000000001'): Promise<AppSettings | null> {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        s.*,
        bc.id   AS "budgetCashRegisterId",   bc.name   AS "budgetCashRegisterName",
        ic.id   AS "invoiceCashRegisterId",  ic.name   AS "invoiceCashRegisterName"
      FROM "app_settings" s
      LEFT JOIN "cash_registers" bc ON bc.id = s."defaultBudgetCashRegisterId"
      LEFT JOIN "cash_registers" ic ON ic.id = s."defaultInvoiceCashRegisterId"
      WHERE s.id = ${companyId}
      LIMIT 1
    `;
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id:                          r.id,
      deadStockDays:               Number(r.deadStockDays),
      safetyStockDays:             Number(r.safetyStockDays),
      stalePriceWarnDays1:         Number(r.stalePriceWarnDays1),
      stalePriceWarnDays2:         Number(r.stalePriceWarnDays2),
      companyTaxCondition:         r.companyTaxCondition,
      printFormat:                 r.printFormat,
      smtpHost:                    r.smtpHost,
      smtpPort:                    r.smtpPort != null ? Number(r.smtpPort) : null,
      smtpUser:                    r.smtpUser,
      smtpPass:                    r.smtpPass,
      smtpFrom:                    r.smtpFrom,
      smtpSecure:                  Boolean(r.smtpSecure),
      defaultBudgetCashRegisterId:  r.defaultBudgetCashRegisterId ?? null,
      defaultInvoiceCashRegisterId: r.defaultInvoiceCashRegisterId ?? null,
      defaultBudgetCashRegister:   r.budgetCashRegisterId  ? { id: r.budgetCashRegisterId,  name: r.budgetCashRegisterName  } : null,
      defaultInvoiceCashRegister:  r.invoiceCashRegisterId ? { id: r.invoiceCashRegisterId, name: r.invoiceCashRegisterName } : null,
    } as AppSettings;
  }

  async upsert(data: UpdateAppSettingsInput, companyId = '00000000-0000-0000-0000-000000000001'): Promise<AppSettings> {
    // Use $executeRaw to bypass stale Prisma client runtime validation on FK scalar fields
    const current = await this.get(companyId);

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
        ${companyId},
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

    return (await this.get(companyId))!;
  }
}
