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
      printFormatInvoice:          r.printFormatInvoice     ?? r.printFormat ?? 'A4',
      printFormatBudget:           r.printFormatBudget      ?? r.printFormat ?? 'A4',
      printFormatOrdenPedido:      r.printFormatOrdenPedido ?? r.printFormat ?? 'THERMAL_80MM',
      printFormatRemito:           r.printFormatRemito      ?? r.printFormat ?? 'A4',
      printFormatRecibo:           r.printFormatRecibo      ?? r.printFormat ?? 'A4',
      smtpHost:                    r.smtpHost,
      smtpPort:                    r.smtpPort != null ? Number(r.smtpPort) : null,
      smtpUser:                    r.smtpUser,
      smtpPass:                    r.smtpPass,
      smtpFrom:                    r.smtpFrom,
      smtpSecure:                  Boolean(r.smtpSecure),
      mpAccessToken:               r.mpAccessToken   ?? null,
      mpPublicKey:                 r.mpPublicKey     ?? null,
      mpWebhookSecret:             r.mpWebhookSecret ?? null,
      mpMode:                      (r.mpMode ?? 'test') as 'test' | 'production',
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
    const companyTaxCondition = data.companyTaxCondition ?? current?.companyTaxCondition ?? 'RESPONSABLE_INSCRIPTO';
    const printFormat            = data.printFormat            ?? current?.printFormat            ?? 'A4';
    const printFormatInvoice     = data.printFormatInvoice     ?? current?.printFormatInvoice     ?? 'A4';
    const printFormatBudget      = data.printFormatBudget      ?? current?.printFormatBudget      ?? 'A4';
    const printFormatOrdenPedido = data.printFormatOrdenPedido ?? current?.printFormatOrdenPedido ?? 'THERMAL_80MM';
    const printFormatRemito      = data.printFormatRemito      ?? current?.printFormatRemito      ?? 'A4';
    const printFormatRecibo      = data.printFormatRecibo      ?? current?.printFormatRecibo      ?? 'A4';
    const smtpHost            = data.smtpHost   !== undefined ? data.smtpHost   : (current?.smtpHost   ?? null);
    const smtpPort            = data.smtpPort   ?? current?.smtpPort   ?? 587;
    const smtpUser            = data.smtpUser   !== undefined ? data.smtpUser   : (current?.smtpUser   ?? null);
    const smtpPass            = data.smtpPass   !== undefined ? data.smtpPass   : (current?.smtpPass   ?? null);
    const smtpFrom            = data.smtpFrom   !== undefined ? data.smtpFrom   : (current?.smtpFrom   ?? null);
    const smtpSecure          = data.smtpSecure ?? current?.smtpSecure ?? false;
    const mpAccessToken       = data.mpAccessToken   !== undefined ? data.mpAccessToken   : (current?.mpAccessToken   ?? null);
    const mpPublicKey         = data.mpPublicKey     !== undefined ? data.mpPublicKey     : (current?.mpPublicKey     ?? null);
    const mpWebhookSecret     = data.mpWebhookSecret !== undefined ? data.mpWebhookSecret : (current?.mpWebhookSecret ?? null);
    const mpMode              = data.mpMode ?? current?.mpMode ?? 'test';

    await prisma.$executeRaw`
      INSERT INTO "app_settings" (
        "id", "deadStockDays", "safetyStockDays",
        "companyTaxCondition", "printFormat",
        "printFormatInvoice", "printFormatBudget", "printFormatOrdenPedido",
        "printFormatRemito", "printFormatRecibo",
        "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom", "smtpSecure",
        "mpAccessToken", "mpPublicKey", "mpWebhookSecret", "mpMode",
        "defaultBudgetCashRegisterId", "defaultInvoiceCashRegisterId", "updatedAt"
      ) VALUES (
        ${companyId},
        ${deadStockDays}, ${safetyStockDays},
        ${companyTaxCondition}, ${printFormat},
        ${printFormatInvoice}, ${printFormatBudget}, ${printFormatOrdenPedido},
        ${printFormatRemito}, ${printFormatRecibo},
        ${smtpHost}, ${smtpPort}, ${smtpUser}, ${smtpPass}, ${smtpFrom}, ${smtpSecure},
        ${mpAccessToken}, ${mpPublicKey}, ${mpWebhookSecret}, ${mpMode},
        ${budgetCashRegisterId}, ${invoiceCashRegisterId}, NOW()
      )
      ON CONFLICT ("id") DO UPDATE SET
        "deadStockDays"                = EXCLUDED."deadStockDays",
        "safetyStockDays"              = EXCLUDED."safetyStockDays",
        "companyTaxCondition"          = EXCLUDED."companyTaxCondition",
        "printFormat"                  = EXCLUDED."printFormat",
        "printFormatInvoice"           = EXCLUDED."printFormatInvoice",
        "printFormatBudget"            = EXCLUDED."printFormatBudget",
        "printFormatOrdenPedido"       = EXCLUDED."printFormatOrdenPedido",
        "printFormatRemito"            = EXCLUDED."printFormatRemito",
        "printFormatRecibo"            = EXCLUDED."printFormatRecibo",
        "smtpHost"                     = EXCLUDED."smtpHost",
        "smtpPort"                     = EXCLUDED."smtpPort",
        "smtpUser"                     = EXCLUDED."smtpUser",
        "smtpPass"                     = EXCLUDED."smtpPass",
        "smtpFrom"                     = EXCLUDED."smtpFrom",
        "smtpSecure"                   = EXCLUDED."smtpSecure",
        "mpAccessToken"                = EXCLUDED."mpAccessToken",
        "mpPublicKey"                  = EXCLUDED."mpPublicKey",
        "mpWebhookSecret"              = EXCLUDED."mpWebhookSecret",
        "mpMode"                       = EXCLUDED."mpMode",
        "defaultBudgetCashRegisterId"  = EXCLUDED."defaultBudgetCashRegisterId",
        "defaultInvoiceCashRegisterId" = EXCLUDED."defaultInvoiceCashRegisterId",
        "updatedAt"                    = NOW()
    `;

    return (await this.get(companyId))!;
  }
}
