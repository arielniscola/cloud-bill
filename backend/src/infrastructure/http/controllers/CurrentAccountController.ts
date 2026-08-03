import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { Currency } from '../../../shared/types';

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
        const accounts = await (currentAccountRepository as any).findAllWithDebt(req.companyId, req.fiscalMode);
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
      const currency = (req.query.currency as Currency) || 'ARS';

      // "Todos": no hay una cuenta única (FORMAL e INFORMAL son filas separadas)
      // — se combinan los movimientos de todas las cuentas de esa moneda.
      let accountIds: string[];
      if (req.fiscalMode) {
        const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency, req.fiscalMode);
        if (!currentAccount) throw new NotFoundError('Current account');
        accountIds = [currentAccount.id];
      } else {
        const accounts = await currentAccountRepository.findAllByCustomerId(req.params.customerId);
        accountIds = accounts.filter((a) => a.currency === currency).map((a) => a.id);
        if (accountIds.length === 0) throw new NotFoundError('Current account');
      }

      const { page, limit } = req.query;
      const result = await currentAccountRepository.getMovements(accountIds, {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      });

      res.json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async addPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      await assertCustomerInCompany(req.params.customerId, req.companyId);
      const currency: Currency = req.body.currency || 'ARS';
      let currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency, req.fiscalMode);

      if (!currentAccount) {
        currentAccount = await currentAccountRepository.createForCustomer(req.params.customerId, currency, undefined, req.fiscalMode);
      }

      const movement = await currentAccountRepository.addMovement({
        currentAccountId: currentAccount.id,
        type: 'CREDIT',
        amount: req.body.amount,
        description: req.body.description || 'Payment',
      });

      res.status(201).json({
        status: 'success',
        data: movement,
      });
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
