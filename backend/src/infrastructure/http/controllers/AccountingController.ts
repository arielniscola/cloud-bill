import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IAccountRepository } from '../../../domain/repositories/IAccountRepository';
import { IJournalEntryRepository } from '../../../domain/repositories/IJournalEntryRepository';
import { seedAccountsForCompany } from '../../services/AccountingService';

export class AccountingController {
  // ── Plan de Cuentas ───────────────────────────────────────────────────────

  async getAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IAccountRepository>('AccountRepository');
      const accounts = await repo.findAll(req.companyId);
      res.json({ status: 'success', data: accounts });
    } catch (error) {
      next(error);
    }
  }

  async seedAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await seedAccountsForCompany(req.companyId);
      const repo = container.resolve<IAccountRepository>('AccountRepository');
      const accounts = await repo.findAll(req.companyId);
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

      const result = await repo.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 20 },
        {
          companyId: req.companyId,
          referenceType: referenceType as string | undefined,
          referenceId: referenceId as string | undefined,
          dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
          dateTo: dateTo ? new Date(dateTo as string) : undefined,
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
      const entry = await repo.findById(req.params.id);
      if (!entry) {
        res.status(404).json({ status: 'error', message: 'Asiento no encontrado' });
        return;
      }
      res.json({ status: 'success', data: entry });
    } catch (error) {
      next(error);
    }
  }

  async getEntriesByReference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IJournalEntryRepository>('JournalEntryRepository');
      const { type, id } = req.params;
      const entries = await repo.findByReference(type, id);
      res.json({ status: 'success', data: entries });
    } catch (error) {
      next(error);
    }
  }
}
