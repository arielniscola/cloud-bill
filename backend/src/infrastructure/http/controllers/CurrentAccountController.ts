import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { NotFoundError } from '../../../shared/errors/AppError';
import { Currency } from '../../../shared/types';

export class CurrentAccountController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );

      if (req.query.hasDebt === 'true') {
        const accounts = await currentAccountRepository.findAllWithDebt();
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
      const accounts = await currentAccountRepository.findAllByCustomerId(req.params.customerId);

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
      const currency = (req.query.currency as Currency) || 'ARS';
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency);

      if (!currentAccount) {
        throw new NotFoundError('Current account');
      }

      const { page, limit } = req.query;
      const result = await currentAccountRepository.getMovements(currentAccount.id, {
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
      const currency: Currency = req.body.currency || 'ARS';
      let currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency);

      if (!currentAccount) {
        currentAccount = await currentAccountRepository.createForCustomer(req.params.customerId, currency);
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
      const currency: Currency = req.body.currency || 'ARS';
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId, currency);

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
