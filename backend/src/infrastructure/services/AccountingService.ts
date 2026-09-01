import { randomUUID } from 'crypto';
import prisma from '../database/prisma';
import { AccountType, CreateAccountInput } from '../../domain/entities/Accounting';
import { companyHasFeature } from '../http/middlewares/featureMiddleware';
import { allocateDocumentNumber } from '../database/DocumentSequence';

// ─── System account codes used for automatic journal entries ─────────────────
export const ACCOUNT_CODES = {
  CAJA:               '1.1.1.1',
  BANCOS:             '1.1.1.2',
  CHEQUES:            '1.1.1.3',
  CLIENTES:           '1.1.2.1',
  IVA_CREDITO:        '1.1.3.1',
  MERCADERIAS:        '1.1.4.1',
  PROVEEDORES:        '2.1.1.1',
  IVA_DEBITO:         '2.1.2.1',
  RET_IVA:            '2.1.2.5',
  RET_IIBB:           '2.1.2.6',
  RET_GANANCIAS:      '2.1.2.7',
  RET_OTRAS:          '2.1.2.8',
  VENTAS:             '4.1.1',
  CMV:                '5.1.1',
} as const;

// ─── Retencion type → account code mapping ────────────────────────────────────
const RETENCION_ACCOUNT_BY_TYPE: Record<string, { code: string; name: string }> = {
  IVA:       { code: ACCOUNT_CODES.RET_IVA,       name: 'Retenciones IVA a pagar' },
  IIBB:      { code: ACCOUNT_CODES.RET_IIBB,      name: 'Retenciones IIBB a pagar' },
  GANANCIAS: { code: ACCOUNT_CODES.RET_GANANCIAS, name: 'Retenciones Ganancias a pagar' },
  OTHER:     { code: ACCOUNT_CODES.RET_OTRAS,     name: 'Retenciones varias a pagar' },
};

// ─── Standard Argentine chart of accounts (PyME comercio/distribución) ───────
function buildChartOfAccounts(companyId: string): CreateAccountInput[] {
  const def = (
    code: string,
    name: string,
    type: AccountType,
    parentCode: string | null,
    isAuxiliary: boolean
  ): CreateAccountInput => ({
    code,
    name,
    type,
    parentCode,
    level: code.split('.').length,
    isAuxiliary,
    companyId,
  });

  return [
    // ── 1 ACTIVO ──────────────────────────────────────────────────────────
    def('1',       'Activo',                              'ASSET',     null,    false),
    def('1.1',     'Activo Corriente',                    'ASSET',     '1',     false),
    def('1.1.1',   'Disponibilidades',                    'ASSET',     '1.1',   false),
    def('1.1.1.1', 'Caja',                                'ASSET',     '1.1.1', true),
    def('1.1.1.2', 'Bancos cuenta corriente',             'ASSET',     '1.1.1', true),
    def('1.1.1.3', 'Cheques a depositar',                 'ASSET',     '1.1.1', true),
    def('1.1.2',   'Créditos por ventas',                 'ASSET',     '1.1',   false),
    def('1.1.2.1', 'Clientes',                            'ASSET',     '1.1.2', true),
    def('1.1.2.2', 'Documentos a cobrar',                 'ASSET',     '1.1.2', true),
    def('1.1.3',   'Créditos fiscales',                   'ASSET',     '1.1',   false),
    def('1.1.3.1', 'IVA Crédito Fiscal',                  'ASSET',     '1.1.3', true),
    def('1.1.3.2', 'Anticipos de impuestos',              'ASSET',     '1.1.3', true),
    def('1.1.4',   'Bienes de cambio',                    'ASSET',     '1.1',   false),
    def('1.1.4.1', 'Mercaderías',                         'ASSET',     '1.1.4', true),
    def('1.2',     'Activo No Corriente',                 'ASSET',     '1',     false),
    def('1.2.1',   'Bienes de uso',                       'ASSET',     '1.2',   false),
    def('1.2.1.1', 'Muebles y útiles',                    'ASSET',     '1.2.1', true),
    def('1.2.1.2', 'Equipos informáticos',                'ASSET',     '1.2.1', true),
    def('1.2.1.3', 'Rodados',                             'ASSET',     '1.2.1', true),
    def('1.2.2',   'Depreciaciones acumuladas',           'ASSET',     '1.2',   false),
    def('1.2.2.1', 'Dep. ac. Muebles y útiles',           'ASSET',     '1.2.2', true),
    def('1.2.2.2', 'Dep. ac. Equipos informáticos',       'ASSET',     '1.2.2', true),

    // ── 2 PASIVO ──────────────────────────────────────────────────────────
    def('2',       'Pasivo',                              'LIABILITY', null,    false),
    def('2.1',     'Pasivo Corriente',                    'LIABILITY', '2',     false),
    def('2.1.1',   'Deudas comerciales',                  'LIABILITY', '2.1',   false),
    def('2.1.1.1', 'Proveedores',                         'LIABILITY', '2.1.1', true),
    def('2.1.1.2', 'Documentos a pagar',                  'LIABILITY', '2.1.1', true),
    def('2.1.2',   'Deudas fiscales',                     'LIABILITY', '2.1',   false),
    def('2.1.2.1', 'IVA Débito Fiscal',                   'LIABILITY', '2.1.2', true),
    def('2.1.2.2', 'IVA a pagar (neto)',                  'LIABILITY', '2.1.2', true),
    def('2.1.2.3', 'Impuesto a las Ganancias a pagar',    'LIABILITY', '2.1.2', true),
    def('2.1.2.4', 'Ingresos Brutos a pagar',             'LIABILITY', '2.1.2', true),
    def('2.1.2.5', 'Retenciones IVA a pagar',             'LIABILITY', '2.1.2', true),
    def('2.1.2.6', 'Retenciones IIBB a pagar',            'LIABILITY', '2.1.2', true),
    def('2.1.2.7', 'Retenciones Ganancias a pagar',       'LIABILITY', '2.1.2', true),
    def('2.1.2.8', 'Retenciones varias a pagar',          'LIABILITY', '2.1.2', true),
    def('2.1.3',   'Remuneraciones y Cargas Sociales',    'LIABILITY', '2.1',   false),
    def('2.1.3.1', 'Sueldos a pagar',                     'LIABILITY', '2.1.3', true),
    def('2.1.3.2', 'Cargas sociales a pagar',             'LIABILITY', '2.1.3', true),
    def('2.2',     'Pasivo No Corriente',                 'LIABILITY', '2',     false),
    def('2.2.1',   'Deudas financieras',                  'LIABILITY', '2.2',   false),
    def('2.2.1.1', 'Préstamos bancarios LP',              'LIABILITY', '2.2.1', true),

    // ── 3 PATRIMONIO NETO ─────────────────────────────────────────────────
    def('3',       'Patrimonio Neto',                     'EQUITY',    null,    false),
    def('3.1',     'Capital',                             'EQUITY',    '3',     false),
    def('3.1.1',   'Capital suscripto e integrado',       'EQUITY',    '3.1',   true),
    def('3.2',     'Reservas',                            'EQUITY',    '3',     false),
    def('3.2.1',   'Reserva legal',                       'EQUITY',    '3.2',   true),
    def('3.3',     'Resultados',                          'EQUITY',    '3',     false),
    def('3.3.1',   'Resultados acumulados',               'EQUITY',    '3.3',   true),
    def('3.3.2',   'Resultado del ejercicio',             'EQUITY',    '3.3',   true),

    // ── 4 INGRESOS ────────────────────────────────────────────────────────
    def('4',       'Ingresos',                            'INCOME',    null,    false),
    def('4.1',     'Ingresos operativos',                 'INCOME',    '4',     false),
    def('4.1.1',   'Ventas de mercaderías',               'INCOME',    '4.1',   true),
    def('4.1.2',   'Ventas de servicios',                 'INCOME',    '4.1',   true),
    def('4.1.3',   'Descuentos otorgados',                'INCOME',    '4.1',   true),
    def('4.1.4',   'Devoluciones de ventas',              'INCOME',    '4.1',   true),
    def('4.2',     'Ingresos financieros',                'INCOME',    '4',     false),
    def('4.2.1',   'Intereses ganados',                   'INCOME',    '4.2',   true),
    def('4.2.2',   'Diferencia de cambio favorable',      'INCOME',    '4.2',   true),
    def('4.3',     'Otros ingresos',                      'INCOME',    '4',     false),
    def('4.3.1',   'Otros ingresos no operativos',        'INCOME',    '4.3',   true),

    // ── 5 EGRESOS ─────────────────────────────────────────────────────────
    def('5',       'Egresos',                             'EXPENSE',   null,    false),
    def('5.1',     'Costo de ventas',                     'EXPENSE',   '5',     false),
    def('5.1.1',   'Costo de mercaderías vendidas',       'EXPENSE',   '5.1',   true),
    def('5.2',     'Gastos de comercialización',          'EXPENSE',   '5',     false),
    def('5.2.1',   'Sueldos - Comercialización',          'EXPENSE',   '5.2',   true),
    def('5.2.2',   'Cargas sociales - Comercialización',  'EXPENSE',   '5.2',   true),
    def('5.2.3',   'Publicidad y propaganda',             'EXPENSE',   '5.2',   true),
    def('5.2.4',   'Fletes y acarreos',                   'EXPENSE',   '5.2',   true),
    def('5.2.5',   'Comisiones',                          'EXPENSE',   '5.2',   true),
    def('5.3',     'Gastos de administración',            'EXPENSE',   '5',     false),
    def('5.3.1',   'Sueldos - Administración',            'EXPENSE',   '5.3',   true),
    def('5.3.2',   'Cargas sociales - Administración',    'EXPENSE',   '5.3',   true),
    def('5.3.3',   'Alquileres',                          'EXPENSE',   '5.3',   true),
    def('5.3.4',   'Servicios públicos',                  'EXPENSE',   '5.3',   true),
    def('5.3.5',   'Seguros',                             'EXPENSE',   '5.3',   true),
    def('5.3.6',   'Mantenimiento y reparaciones',        'EXPENSE',   '5.3',   true),
    def('5.3.7',   'Papelería y útiles de oficina',       'EXPENSE',   '5.3',   true),
    def('5.3.8',   'Depreciaciones y amortizaciones',     'EXPENSE',   '5.3',   true),
    def('5.4',     'Gastos financieros',                  'EXPENSE',   '5',     false),
    def('5.4.1',   'Intereses pagados',                   'EXPENSE',   '5.4',   true),
    def('5.4.2',   'Comisiones bancarias',                'EXPENSE',   '5.4',   true),
    def('5.4.3',   'Diferencia de cambio desfavorable',   'EXPENSE',   '5.4',   true),
    def('5.5',     'Impuestos y tasas',                   'EXPENSE',   '5',     false),
    def('5.5.1',   'Impuesto a las ganancias',            'EXPENSE',   '5.5',   true),
    def('5.5.2',   'Ingresos brutos',                     'EXPENSE',   '5.5',   true),
    def('5.5.3',   'Tasas municipales',                   'EXPENSE',   '5.5',   true),
  ];
}

// ─── Idempotent account ensure (used for lazy-add of retencion accounts) ────
async function ensureAccount(
  code: string,
  name: string,
  parentCode: string,
  companyId: string,
): Promise<void> {
  const level = code.split('.').length;
  await prisma.$executeRaw`
    INSERT INTO "accounts" ("id","code","name","type","parentCode","level","isAuxiliary","isActive","companyId","createdAt","updatedAt")
    VALUES (
      ${randomUUID()}, ${code}, ${name}, 'LIABILITY',
      ${parentCode}, ${level}, true, true, ${companyId}, NOW(), NOW()
    )
    ON CONFLICT ("code","companyId") DO NOTHING
  `;
}

// ─── Helper to get an account id by code ─────────────────────────────────────
async function getAccountId(code: string, companyId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "accounts"
    WHERE "code" = ${code} AND "companyId" = ${companyId} AND "isActive" = true
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

// ─── Auto-generate the next journal entry number ──────────────────────────────
async function nextJournalNumber(companyId: string): Promise<string> {
  return allocateDocumentNumber('JOURNAL_ENTRY', companyId);
}

// ─── Create a journal entry + its lines ──────────────────────────────────────
async function createEntry(
  description: string,
  referenceType: string | null,
  referenceId: string | null,
  companyId: string,
  userId: string | null,
  lines: { code: string; debit: number; credit: number; description?: string }[]
): Promise<void> {
  const number = await nextJournalNumber(companyId);
  const entryId = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "journal_entries" ("id","number","date","description","referenceType","referenceId","companyId","userId","createdAt")
    VALUES (${entryId}, ${number}, NOW(), ${description}, ${referenceType}, ${referenceId}, ${companyId}, ${userId}, NOW())
  `;

  for (const line of lines) {
    const accountId = await getAccountId(line.code, companyId);
    if (!accountId) continue; // skip if accounts not seeded

    await prisma.$executeRaw`
      INSERT INTO "journal_entry_lines" ("id","journalEntryId","accountCode","accountId","description","debit","credit")
      VALUES (${randomUUID()}, ${entryId}, ${line.code}, ${accountId}, ${line.description ?? null}, ${line.debit}, ${line.credit})
    `;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Seeds the standard Argentine chart of accounts for a company.
 * Safe to call multiple times — only runs if the company has no accounts yet.
 */
export async function seedAccountsForCompany(companyId: string): Promise<void> {
  const existing = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "accounts" WHERE "companyId" = ${companyId}
  `;
  if (Number(existing[0]?.c ?? 0n) > 0) return;

  const accounts = buildChartOfAccounts(companyId);
  for (const acc of accounts) {
    await prisma.$executeRaw`
      INSERT INTO "accounts" ("id","code","name","type","parentCode","level","isAuxiliary","isActive","companyId","createdAt","updatedAt")
      VALUES (
        ${randomUUID()},
        ${acc.code},
        ${acc.name},
        ${acc.type},
        ${acc.parentCode ?? null},
        ${acc.level},
        ${acc.isAuxiliary ?? false},
        true,
        ${acc.companyId},
        NOW(), NOW()
      )
      ON CONFLICT ("code","companyId") DO NOTHING
    `;
  }
}

/**
 * Records journal entry when a sales invoice is created.
 *   DR Clientes         — total (inc. IVA)
 *   CR Ventas           — net amount (excl. IVA)
 *   CR IVA Débito       — IVA amount
 *
 * For Nota de Crédito the debits/credits are swapped.
 */
export async function recordInvoiceCreated(invoice: {
  id: string;
  number: string;
  type: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  companyId: string;
  userId: string;
}): Promise<void> {
  try {
    if (!(await companyHasFeature(invoice.companyId, 'accounting'))) return;
    const isNC = invoice.type.startsWith('NOTA_CREDITO');
    const isND = invoice.type.startsWith('NOTA_DEBITO');
    const isFact = invoice.type.startsWith('FACTURA');

    if (!isFact && !isNC && !isND) return;

    const net  = Math.round(invoice.subtotal  * 100) / 100;
    const iva  = Math.round(invoice.taxAmount * 100) / 100;
    const total = Math.round(invoice.total    * 100) / 100;

    let lines: { code: string; debit: number; credit: number; description?: string }[];

    if (isFact || isND) {
      // Normal sale / debit note: DR Clientes | CR Ventas + CR IVA Débito
      lines = [
        { code: ACCOUNT_CODES.CLIENTES,  debit: total, credit: 0,   description: invoice.number },
        { code: ACCOUNT_CODES.VENTAS,    debit: 0,     credit: net, description: invoice.number },
        ...(iva > 0 ? [{ code: ACCOUNT_CODES.IVA_DEBITO, debit: 0, credit: iva, description: invoice.number }] : []),
      ];
    } else {
      // Credit note: DR Ventas + DR IVA Débito | CR Clientes
      lines = [
        { code: ACCOUNT_CODES.VENTAS,    debit: net,   credit: 0,    description: invoice.number },
        ...(iva > 0 ? [{ code: ACCOUNT_CODES.IVA_DEBITO, debit: iva, credit: 0, description: invoice.number }] : []),
        { code: ACCOUNT_CODES.CLIENTES,  debit: 0,     credit: total, description: invoice.number },
      ];
    }

    const typeLabel = isNC ? 'Nota de Crédito' : isND ? 'Nota de Débito' : 'Factura';
    await createEntry(
      `${typeLabel} ${invoice.number}`,
      'INVOICE',
      invoice.id,
      invoice.companyId,
      invoice.userId,
      lines
    );
  } catch (err) {
    // Never fail the main operation due to accounting errors
    console.error('[AccountingService] recordInvoiceCreated error:', err);
  }
}

/**
 * Records journal entry when a payment (recibo) is received for an invoice.
 *   DR Caja | Bancos | Cheques — amount
 *   CR Clientes                — amount
 */
export async function recordPaymentReceived(recibo: {
  id: string;
  number: string;
  amount: number;
  paymentMethod: string;
  companyId: string;
  userId: string;
  invoiceNumber?: string;
}): Promise<void> {
  try {
    if (!(await companyHasFeature(recibo.companyId, 'accounting'))) return;
    const amount = Math.round(recibo.amount * 100) / 100;

    const cashAccount =
      recibo.paymentMethod === 'BANK_TRANSFER' ? ACCOUNT_CODES.BANCOS :
      recibo.paymentMethod === 'CHECK'          ? ACCOUNT_CODES.CHEQUES :
      ACCOUNT_CODES.CAJA; // CASH | CARD

    const desc = recibo.invoiceNumber
      ? `${recibo.number} (${recibo.invoiceNumber})`
      : recibo.number;

    await createEntry(
      `Cobro ${recibo.number}`,
      'PAYMENT',
      recibo.id,
      recibo.companyId,
      recibo.userId,
      [
        { code: cashAccount,            debit: amount, credit: 0,      description: desc },
        { code: ACCOUNT_CODES.CLIENTES, debit: 0,      credit: amount, description: desc },
      ]
    );
  } catch (err) {
    console.error('[AccountingService] recordPaymentReceived error:', err);
  }
}

/**
 * Records journal entry when a credit-note refund is paid out to a customer.
 * Mirror of recordPaymentReceived (money leaves the company):
 *   DR Clientes        — amount  (cancels the credit owed to the customer)
 *   CR Caja | Bancos   — amount  (cash/bank outflow)
 */
export async function recordRefundPaid(recibo: {
  id: string;
  number: string;
  amount: number;
  paymentMethod: string;
  companyId: string;
  userId: string;
  invoiceNumber?: string;
}): Promise<void> {
  try {
    if (!(await companyHasFeature(recibo.companyId, 'accounting'))) return;
    const amount = Math.round(recibo.amount * 100) / 100;

    const cashAccount =
      recibo.paymentMethod === 'BANK_TRANSFER' ? ACCOUNT_CODES.BANCOS :
      recibo.paymentMethod === 'CHECK'          ? ACCOUNT_CODES.CHEQUES :
      ACCOUNT_CODES.CAJA; // CASH | CARD

    const desc = recibo.invoiceNumber
      ? `${recibo.number} (${recibo.invoiceNumber})`
      : recibo.number;

    await createEntry(
      `Devolución ${recibo.number}`,
      'PAYMENT',
      recibo.id,
      recibo.companyId,
      recibo.userId,
      [
        { code: ACCOUNT_CODES.CLIENTES, debit: amount, credit: 0,      description: desc },
        { code: cashAccount,            debit: 0,      credit: amount, description: desc },
      ]
    );
  } catch (err) {
    console.error('[AccountingService] recordRefundPaid error:', err);
  }
}

/**
 * Records journal entry when a purchase is created.
 *   DR Mercaderías     — net amount (excl. IVA)
 *   DR IVA Crédito     — IVA amount
 *   CR Proveedores     — total (inc. IVA)
 */
export async function recordPurchaseCreated(purchase: {
  id: string;
  number: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  companyId: string;
  userId: string;
}): Promise<void> {
  try {
    if (!(await companyHasFeature(purchase.companyId, 'accounting'))) return;
    const net   = Math.round(purchase.subtotal  * 100) / 100;
    const iva   = Math.round(purchase.taxAmount * 100) / 100;
    const total = Math.round(purchase.total     * 100) / 100;

    await createEntry(
      `Compra ${purchase.number}`,
      'PURCHASE',
      purchase.id,
      purchase.companyId,
      purchase.userId,
      [
        { code: ACCOUNT_CODES.MERCADERIAS,  debit: net,   credit: 0,     description: purchase.number },
        ...(iva > 0 ? [{ code: ACCOUNT_CODES.IVA_CREDITO, debit: iva, credit: 0, description: purchase.number }] : []),
        { code: ACCOUNT_CODES.PROVEEDORES,  debit: 0,     credit: total, description: purchase.number },
      ]
    );
  } catch (err) {
    console.error('[AccountingService] recordPurchaseCreated error:', err);
  }
}

/**
 * Records journal entry when a supplier payment (orden de pago) is settled.
 *
 * With no retenciones:
 *   DR Proveedores              — cash paid
 *   CR Caja | Bancos | Cheques  — cash paid
 *
 * With retenciones (sum = R, cash = C, gross = C + R):
 *   DR Proveedores                          — gross
 *   CR Caja | Bancos | Cheques              — cash
 *   CR Retenciones {IVA|IIBB|Ganancias|...} — per type
 *
 * Gated by the `accounting` feature.
 */
export async function recordSupplierPayment(payment: {
  id: string;
  number: string;
  amount: number;            // cash actually paid (net of retenciones)
  paymentMethod: string;
  companyId: string;
  userId: string;
  supplierName?: string;
  retenciones?: { type: string; amount: number }[];
}): Promise<void> {
  try {
    if (!(await companyHasFeature(payment.companyId, 'accounting'))) return;

    const cash = Math.round(payment.amount * 100) / 100;
    if (cash <= 0 && (!payment.retenciones || payment.retenciones.length === 0)) return;

    const cashAccount =
      payment.paymentMethod === 'BANK_TRANSFER' ? ACCOUNT_CODES.BANCOS  :
      payment.paymentMethod === 'CHECK'         ? ACCOUNT_CODES.CHEQUES :
      ACCOUNT_CODES.CAJA; // CASH | CARD | otros

    const desc = payment.supplierName
      ? `${payment.number} (${payment.supplierName})`
      : payment.number;

    // Sum retenciones by type (handles multiple retenciones of the same type across invoices)
    const retencionTotals = new Map<string, number>();
    for (const r of payment.retenciones ?? []) {
      const key = RETENCION_ACCOUNT_BY_TYPE[r.type] ? r.type : 'OTHER';
      retencionTotals.set(key, (retencionTotals.get(key) ?? 0) + r.amount);
    }

    // Lazy-ensure retencion accounts exist for this company (no-op if already seeded)
    for (const type of retencionTotals.keys()) {
      const acc = RETENCION_ACCOUNT_BY_TYPE[type];
      await ensureAccount(acc.code, acc.name, '2.1.2', payment.companyId);
    }

    const totalRetenciones = Array.from(retencionTotals.values())
      .reduce((s, v) => s + v, 0);
    const gross = Math.round((cash + totalRetenciones) * 100) / 100;

    const lines: { code: string; debit: number; credit: number; description?: string }[] = [
      { code: ACCOUNT_CODES.PROVEEDORES, debit: gross, credit: 0, description: desc },
    ];
    if (cash > 0) {
      lines.push({ code: cashAccount, debit: 0, credit: cash, description: desc });
    }
    for (const [type, amt] of retencionTotals.entries()) {
      const acc = RETENCION_ACCOUNT_BY_TYPE[type];
      const rounded = Math.round(amt * 100) / 100;
      if (rounded <= 0) continue;
      lines.push({ code: acc.code, debit: 0, credit: rounded, description: `${desc} – Retenc. ${type}` });
    }

    await createEntry(
      `Pago a proveedor ${payment.number}`,
      'SUPPLIER_PAYMENT',
      payment.id,
      payment.companyId,
      payment.userId,
      lines,
    );
  } catch (err) {
    console.error('[AccountingService] recordSupplierPayment error:', err);
  }
}

/**
 * Posts a reversing journal entry for a previously recorded one.
 * Looks up the original entry by referenceType + referenceId and creates a new
 * entry with debits/credits swapped. The original entry is preserved.
 *
 * Gated by the `accounting` feature.
 */
export async function reverseJournalEntry(
  referenceType: string,
  referenceId: string,
  companyId: string,
  userId: string | null,
  description: string,
): Promise<void> {
  try {
    if (!(await companyHasFeature(companyId, 'accounting'))) return;

    const original = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "journal_entries"
      WHERE "referenceType" = ${referenceType}
        AND "referenceId"   = ${referenceId}
        AND "companyId"     = ${companyId}
      ORDER BY "createdAt" ASC
      LIMIT 1
    `;
    if (!original[0]) return;

    const originalLines = await prisma.$queryRaw<{
      accountCode: string; debit: any; credit: any; description: string | null;
    }[]>`
      SELECT "accountCode", debit, credit, description
      FROM "journal_entry_lines"
      WHERE "journalEntryId" = ${original[0].id}
    `;
    if (originalLines.length === 0) return;

    // Idempotency: if a reversal already exists, do nothing
    const reversalType = `${referenceType}_REVERSAL`;
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "journal_entries"
      WHERE "referenceType" = ${reversalType}
        AND "referenceId"   = ${referenceId}
        AND "companyId"     = ${companyId}
      LIMIT 1
    `;
    if (existing[0]) return;

    const lines = originalLines.map((l) => ({
      code:        l.accountCode,
      debit:       Number(l.credit ?? 0),
      credit:      Number(l.debit  ?? 0),
      description: l.description ?? undefined,
    }));

    await createEntry(description, reversalType, referenceId, companyId, userId, lines);
  } catch (err) {
    console.error('[AccountingService] reverseJournalEntry error:', err);
  }
}

/**
 * Reverses the journal entry for a previously paid supplier OP that is now being cancelled.
 * Idempotent — does nothing if no original entry was found or a reversal already exists.
 */
export async function recordSupplierPaymentReversal(
  paymentId: string,
  paymentNumber: string,
  companyId: string,
  userId: string,
): Promise<void> {
  await reverseJournalEntry(
    'SUPPLIER_PAYMENT',
    paymentId,
    companyId,
    userId,
    `Anulación pago a proveedor ${paymentNumber}`,
  );
}
