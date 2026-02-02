import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class CurrentAccountController {
  async findByCustomerId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentAccountRepository = container.resolve<ICurrentAccountRepository>(
        'CurrentAccountRepository'
      );
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId);

      if (!currentAccount) {
        throw new NotFoundError('Current account');
      }

      res.json({
        status: 'success',
        data: { currentAccount },
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
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId);

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
        data: result,
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
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId);

      if (!currentAccount) {
        throw new NotFoundError('Current account');
      }

      const movement = await currentAccountRepository.addMovement({
        currentAccountId: currentAccount.id,
        type: 'CREDIT',
        amount: req.body.amount,
        description: req.body.description || 'Payment',
      });

      res.status(201).json({
        status: 'success',
        data: { movement },
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
      const currentAccount = await currentAccountRepository.findByCustomerId(req.params.customerId);

      if (!currentAccount) {
        throw new NotFoundError('Current account');
      }

      const updatedAccount = await currentAccountRepository.updateCreditLimit(
        currentAccount.id,
        req.body.creditLimit
      );

      res.json({
        status: 'success',
        data: { currentAccount: updatedAccount },
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
      const balance = await currentAccountRepository.getBalance(req.params.customerId);

      res.json({
        status: 'success',
        data: { balance },
      });
    } catch (error) {
      next(error);
    }
  }
}
