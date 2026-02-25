import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { CreateCustomerUseCase } from '../../../application/use-cases/customers/CreateCustomerUseCase';
import { GetCustomerUseCase } from '../../../application/use-cases/customers/GetCustomerUseCase';
import { ListCustomersUseCase } from '../../../application/use-cases/customers/ListCustomersUseCase';
import { UpdateCustomerUseCase } from '../../../application/use-cases/customers/UpdateCustomerUseCase';
import { DeleteCustomerUseCase } from '../../../application/use-cases/customers/DeleteCustomerUseCase';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';

export class CustomerController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const useCase = container.resolve(CreateCustomerUseCase);
      const customer = await useCase.execute(req.body);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Customer',
        entityId: customer.id,
        description: `Cliente ${customer.name} creado`,
      });

      res.status(201).json({
        status: 'success',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const useCase = container.resolve(GetCustomerUseCase);
      const customer = await useCase.execute(req.params.id);

      res.json({
        status: 'success',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const useCase = container.resolve(ListCustomersUseCase);
      const { page, limit, ...filters } = req.query;

      const result = await useCase.execute(
        { page: Number(page) || 1, limit: Number(limit) || 10 },
        filters
      );

      res.json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const useCase = container.resolve(UpdateCustomerUseCase);
      const customer = await useCase.execute(req.params.id, req.body);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Customer',
        entityId: customer.id,
        description: `Cliente ${customer.name} actualizado`,
      });

      res.json({
        status: 'success',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const useCase = container.resolve(DeleteCustomerUseCase);
      await useCase.execute(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Customer',
        entityId: req.params.id,
        description: `Cliente ${req.params.id} eliminado`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
