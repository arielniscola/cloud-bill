import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { container } from 'tsyringe';
import { IAccountRepository } from '../../../domain/repositories/IAccountRepository';
import { IJournalEntryRepository } from '../../../domain/repositories/IJournalEntryRepository';
import { seedAccountsForCompany } from '../../services/AccountingService';

export class AccountingController {
  // ── Plan de Cuentas ───────────────────────────────────────────────────────

  async getAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAccountRepository>('AccountRepository');
      const accounts = await repo.findAll(req.companyId!);
      res.json({ status: 'success', data: accounts });
    } catch (error) {
      next(error);
    }
  }

  async seedAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await seedAccountsForCompany(req.companyId!);
      const repo = container.resolve<IAccountRepository>('AccountRepository');
      const accounts = await repo.findAll(req.companyId!);
      res.json({ status: 'success', data: accounts, message: 'Plan de cuentas inicializado' });
    } catch (error) {
      next(error);
    }
  }

  // ── Asientos Contables ────────────────────────────────────────────────────

  async getJournalEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IJournalEntryRepository>('JournalEntryRepository');
      const { page, limit, referenceType, referenceId, dateFrom, dateTo } = req.query;

      const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
      const date = (v: unknown) => {
        const d = typeof v === 'string' && v ? new Date(v) : undefined;
        return d && !Number.isNaN(d.getTime()) ? d : undefined;
      };
      const int = (v: unknown, fallback: number, max: number) => {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
      };

      const result = await repo.findAll(
        { page: int(page, 1, Number.MAX_SAFE_INTEGER), limit: int(limit, 20, 200) },
        {
          companyId: req.companyId!,
          referenceType: text(referenceType),
          referenceId: text(referenceId),
          dateFrom: date(dateFrom),
          dateTo: date(dateTo),
        }
      );

      res.json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  async getJournalEntryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IJournalEntryRepository>('JournalEntryRepository');
      const entry = await repo.findById(req.params.id, req.companyId);
      if (!entry) {
        res.status(404).json({ status: 'error', message: 'Asiento no encontrado' });
        return;
      }
      res.json({ status: 'success', data: entry });
    } catch (error) {
      next(error);
    }
  }

  async createJournalEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schema = z.object({
        date: z.string().optional(),
        description: z.string().min(1, 'Descripción requerida'),
        lines: z.array(z.object({
          accountCode: z.string().min(1, 'Cuenta requerida'),
          description: z.string().optional(),
          debit: z.number().min(0),
          credit: z.number().min(0),
        })).min(2, 'Se requieren al menos 2 líneas'),
      });

      const body = schema.parse(req.body);

      // Validate balance
      const totalDebit = body.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = body.lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        res.status(400).json({ status: 'error', message: `El asiento no balancea: Debe ${totalDebit.toFixed(2)} ≠ Haber ${totalCredit.toFixed(2)}` });
        return;
      }

      // Validate each line has debit or credit (not both zero)
      for (const line of body.lines) {
        if (line.debit === 0 && line.credit === 0) {
          res.status(400).json({ status: 'error', message: `La línea de cuenta ${line.accountCode} no tiene importe` });
          return;
        }
      }

      // Validate account codes exist and are auxiliary
      const accountRepo = container.resolve<IAccountRepository>('AccountRepository');
      const allAccounts = await accountRepo.findAll(req.companyId!);
      const accountMap = new Map(allAccounts.map((a) => [a.code, a]));

      for (const line of body.lines) {
        const account = accountMap.get(line.accountCode);
        if (!account) {
          res.status(400).json({ status: 'error', message: `Cuenta ${line.accountCode} no encontrada` });
          return;
        }
        if (!account.isAuxiliary) {
          res.status(400).json({ status: 'error', message: `Cuenta ${line.accountCode} (${account.name}) no es auxiliar (imputables)` });
          return;
        }
      }

      const repo = container.resolve<IJournalEntryRepository>('JournalEntryRepository');
      const entry = await repo.create({
        date: body.date ? new Date(body.date) : new Date(),
        description: body.description,
        referenceType: 'MANUAL',
        companyId: req.companyId!,
        userId: req.user?.userId,
        lines: body.lines,
      });

      res.status(201).json({ status: 'success', data: entry });
    } catch (error) {
      next(error);
    }
  }

  async getEntriesByReference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IJournalEntryRepository>('JournalEntryRepository');
      const { type, id } = req.params;
      const entries = await repo.findByReference(type, id, req.companyId!);
      res.json({ status: 'success', data: entries });
    } catch (error) {
      next(error);
    }
  }
}
