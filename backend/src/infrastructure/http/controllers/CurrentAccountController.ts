import { Request, Response, NextFunction } from 'express';

import { startOfDay, todayIso } from '../../../shared/utils/dateRange';
import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { IReciboRepository } from '../../../domain/repositories/IReciboRepository';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { createPaymentSchema } from '../../../application/dtos/currentAccount.dto';
import { addCustomerMovement } from '../../services/customerAccountMovements';
import { getCustomerCredits } from '../../services/CustomerSettlementService';
import { recordPaymentReceived } from '../../services/AccountingService';
import { Currency } from '../../../shared/types';
import prisma from '../../database/prisma';
import { bucketizeAging, customerAgingRows } from '../../../shared/helpers/aging';

/** La cuenta corriente no tiene companyId propio: se protege validando el cliente. */
async function assertCustomerInCompany(customerId: string, companyId?: string): Promise<void> {
  const customerRepo = container.resolve<ICustomerRepository>('CustomerRepository');
  const customer = await customerRepo.findById(customerId, companyId);
  if (!customer) throw new NotFoundError('Customer');
}

export class CurrentAccountController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );

      if (req.query.hasDebt === 'true') {
        const accounts = await currentAccountRepository.findAllWithDebt(
          req.companyId,
          req.fiscalMode,
          req.query.includeCredit === 'true'
        );
        res.json({ status: 'success', data: accounts });
        return;
      }

      res.json({ status: 'success', data: [] });
    } catch (error) {
      next(error);
    }
  }

  async findByCustomerId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      const accounts = await currentAccountRepository.findAllByCustomerId(req.params.customerId, req.fiscalMode);

      res.json({
        status: 'success',
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      // 'ALL' = extracto unificado: la cuenta se lee en pesos y se combinan las
      // cuentas de todas las monedas en una sola lista cronológica.
      const rawCurrency = (req.query.currency as string) || 'ARS';
      const allCurrencies = rawCurrency === 'ALL';
      const currency = (allCurrencies ? 'ARS' : rawCurrency) as Currency;

      // "Todos": no hay una cuenta única (FORMAL e INFORMAL son filas separadas)
      // — se combinan los movimientos de todas las cuentas que correspondan.
      let accountIds: string[];
      if (allCurrencies) {
        const accounts = await currentAccountRepository.findAllByCustomerId(req.params.customerId, req.fiscalMode);
        accountIds = accounts.map((a) => a.id);
        if (accountIds.length === 0) throw new NotFoundError('Current account');
      } else if (req.fiscalMode) {
        const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency, req.fiscalMode);
        if (!currentAccount) throw new NotFoundError('Current account');
        accountIds = [currentAccount.id];
      } else {
        const accounts = await currentAccountRepository.findAllByCustomerId(req.params.customerId);
        accountIds = accounts.filter((a) => a.currency === currency).map((a) => a.id);
        if (accountIds.length === 0) throw new NotFoundError('Current account');
      }

      const { page, limit, type, origin, search, startDate, endDate } = req.query as Record<string, string>;
      const result = await currentAccountRepository.getMovements(
        accountIds,
        { page: Number(page) || 1, limit: Number(limit) || 10 },
        { type: type as 'DEBIT' | 'CREDIT' | undefined, origin: origin as any, search, startDate, endDate }
      );

      res.json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Pago a cuenta del cliente (sin factura). Genera un RECIBO como cualquier
  // cobro: entra a la caja o al banco, acredita la cuenta corriente y queda
  // como saldo a favor que después se aplica a facturas (recibo de compensación).
  async addPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reciboRepo = container.resolve<IReciboRepository>('ReciboRepository');
      const cashRegisterRepo = container.resolve<ICashRegisterRepository>('CashRegisterRepository');
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      const data = createPaymentSchema.parse(req.body);
      const fiscalMode = (req.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';

      const isBankTransfer = data.paymentMethod === 'BANK_TRANSFER';
      const usesCaja = data.paymentMethod === 'CASH' || data.paymentMethod === 'CARD';
      if (usesCaja && data.cashRegisterId) {
        const cashRegister = await cashRegisterRepo.findById(data.cashRegisterId);
        if (!cashRegister) throw new AppError('Caja no encontrada', 400);
        if (!cashRegister.isActive) throw new AppError('La caja seleccionada está inactiva', 400);
      }

      let recibo: any;
      let movement: any;
      await prisma.$transaction(async (tx) => {
        recibo = await reciboRepo.create({
          invoiceId: null,
          customerId: req.params.customerId,
          userId: req.user!.userId,
          cashRegisterId: usesCaja ? (data.cashRegisterId ?? null) : null,
          amount: data.amount,
          currency: data.currency,
          paymentMethod: data.paymentMethod,
          reference: data.reference ?? null,
          bank: data.bank ?? null,
          checkDueDate: data.checkDueDate ? new Date(data.checkDueDate) : null,
          notes: data.description || 'Pago a cuenta',
          companyId: req.companyId,
          fiscalMode,
        } as any, tx);

        if (isBankTransfer && data.bankAccountId) {
          await (tx as any).bankMovement.create({
            data: {
              bankAccountId: data.bankAccountId,
              type: 'CREDIT',
              amount: data.amount,
              description: `Pago a cuenta (${recibo.number})`,
              reciboId: recibo.id,
              companyId: req.companyId,
            },
          });
          await tx.$executeRaw`
            UPDATE "bank_accounts" SET balance = balance + ${data.amount}, "updatedAt" = NOW() WHERE id = ${data.bankAccountId}
          `;
        }

        movement = await addCustomerMovement({
          customerId: req.params.customerId,
          currency: data.currency,
          fiscalMode,
          type: 'CREDIT',
          amount: data.amount,
          description: `Pago a cuenta ${recibo.number}${data.description ? ` - ${data.description}` : ''}`,
          reciboId: recibo.id,
          cashRegisterId: usesCaja ? (data.cashRegisterId ?? null) : null,
        }, tx);
      }, { timeout: 30000 });

      await recordPaymentReceived({
        id: recibo.id,
        number: recibo.number,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        companyId: req.companyId!,
        userId: req.user!.userId,
      });

      res.status(201).json({
        status: 'success',
        data: movement,
        recibo,
      });
    } catch (error) {
      next(error);
    }
  }

  // Saldo a favor del cliente aplicable a facturas (NC con remanente, NC
  // internas y pagos a cuenta), para el cobro con "Usar saldo a favor".
  async getCredits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      const credits = await getCustomerCredits(req.params.customerId, {
        companyId: req.companyId,
        currency: typeof req.query.currency === 'string' && req.query.currency ? req.query.currency : undefined,
        fiscalMode: req.fiscalMode,
      });
      res.json({ status: 'success', data: credits });
    } catch (error) {
      next(error);
    }
  }

  async setCreditLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      const currency: Currency = req.body.currency || 'ARS';
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency, req.fiscalMode);

      if (!currentAccount) {
        throw new NotFoundError('Current account');
      }

      const updatedAccount = await currentAccountRepository.updateCreditLimit(
        currentAccount.id,
        req.body.creditLimit
      );

      res.json({
        status: 'success',
        data: updatedAccount,
      });
    } catch (error) {
      next(error);
    }
  }

  // ── GET /current-accounts/stats ──────────────────────────────────
  // Datos de cabecera del listado: antigüedad de la deuda por cliente
  // (comprobantes impagos, no el saldo acumulado) y lo cobrado en el mes.
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const monthStart = startOfDay(`${todayIso().slice(0, 7)}-01`)!;

      const [agingRows, collected] = await Promise.all([
        customerAgingRows(companyId, req.fiscalMode, undefined, (req.query.currency as string) || 'ARS'),
        prisma.$queryRaw<{ currency: string; total: number; count: bigint }[]>`
          SELECT r.currency, SUM(r.amount)::float8 AS total, COUNT(*) AS count
          FROM "recibos" r
          WHERE r."companyId" = ${companyId}
            AND (${req.fiscalMode ?? null}::text IS NULL OR r."fiscalMode" = ${req.fiscalMode ?? null})
            AND r.status = 'EMITTED'
            AND r."paymentMethod" <> 'COMPENSACION'
            AND r.date >= ${monthStart}
          GROUP BY r.currency
        `,
      ]);

      res.json({
        status: 'success',
        data: {
          aging: bucketizeAging(agingRows),
          collectedThisMonth: collected.map((c) => ({
            currency: c.currency,
            total: Number(c.total),
            count: Number(c.count),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ── GET /current-accounts/customer/:customerId/summary ────────────
  // Antigüedad de la deuda del cliente y su comportamiento de pago, para el
  // encabezado de la cuenta.
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const { customerId } = req.params;
      await assertCustomerInCompany(customerId, companyId);

      const since90 = new Date(Date.now() - 90 * 86400000);
      const since365 = new Date(Date.now() - 365 * 86400000);

      const [agingRows, delay, collected90, invoiced90, notes] = await Promise.all([
        customerAgingRows(companyId, req.fiscalMode, customerId, (req.query.currency as string) || 'ARS'),
        // Demora promedio: días entre el vencimiento de la factura y el cobro.
        prisma.$queryRaw<{ days: number | null }[]>`
          SELECT AVG(GREATEST(0, DATE_PART('day', r.date - COALESCE(i."dueDate", i.date))))::float8 AS days
          FROM "recibos" r
          JOIN "invoices" i ON i.id = r."invoiceId"
          WHERE r."companyId" = ${companyId}
            AND (${req.fiscalMode ?? null}::text IS NULL OR r."fiscalMode" = ${req.fiscalMode ?? null})
            AND r.status = 'EMITTED'
            AND r."customerId" = ${customerId}
            AND r.date >= ${since365}
        `,
        prisma.$queryRaw<{ currency: string; total: number }[]>`
          SELECT r.currency, SUM(r.amount)::float8 AS total
          FROM "recibos" r
          WHERE r."companyId" = ${companyId}
            AND (${req.fiscalMode ?? null}::text IS NULL OR r."fiscalMode" = ${req.fiscalMode ?? null})
            AND r.status = 'EMITTED'
            AND r."paymentMethod" <> 'COMPENSACION'
            AND r."customerId" = ${customerId}
            AND r.date >= ${since90}
          GROUP BY r.currency
        `,
        // Facturado neto: facturas y ND suman, NC resta.
        prisma.$queryRaw<{ currency: string; total: number }[]>`
          SELECT i.currency, SUM(
            CASE WHEN i.type::text LIKE 'NOTA_CREDITO%' THEN -i.total ELSE i.total END
          )::float8 AS total
          FROM "invoices" i
          WHERE i."companyId" = ${companyId}
            AND (${req.fiscalMode ?? null}::text IS NULL OR i."fiscalMode" = ${req.fiscalMode ?? null})
            AND i."customerId" = ${customerId}
            AND i.status::text NOT IN ('DRAFT', 'CANCELLED')
            AND i.date >= ${since90}
          GROUP BY i.currency
        `,
        prisma.$queryRaw<{ reason: string; notes: string | null; createdAt: Date }[]>`
          SELECT n.reason, n.notes, n."createdAt"
          FROM "internal_notes" n
          WHERE n."companyId" = ${companyId}
            AND n."customerId" = ${customerId}
          ORDER BY n."createdAt" DESC
          LIMIT 1
        `,
      ]);

      const aging = bucketizeAging(agingRows).find((a) => a.entityId === customerId) ?? null;
      const avgDays = delay[0]?.days;

      res.json({
        status: 'success',
        data: {
          aging,
          avgPaymentDelayDays: avgDays === null || avgDays === undefined ? null : Math.round(Number(avgDays)),
          collected90: collected90.map((c) => ({ currency: c.currency, total: Number(c.total) })),
          invoiced90: invoiced90.map((c) => ({ currency: c.currency, total: Number(c.total) })),
          lastInternalNote: notes[0]
            ? { reason: notes[0].reason, notes: notes[0].notes, createdAt: notes[0].createdAt }
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      const currency = (req.query.currency as Currency) || 'ARS';
      const balance = await currentAccountRepository.getBalance(req.params.customerId, currency);

      res.json({
        status: 'success',
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }
}
