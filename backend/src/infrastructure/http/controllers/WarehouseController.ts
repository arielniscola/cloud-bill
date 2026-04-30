import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, ForbiddenError } from '../../../shared/errors/AppError';
import { companyHasFeature } from '../middlewares/featureMiddleware';

export class WarehouseController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      if (req.companyId) {
        const hasMulti = await companyHasFeature(req.companyId, 'multi_warehouse');
        if (!hasMulti) {
          const existing = await warehouseRepository.findAll(req.companyId);
          if (existing.length >= 1) {
            throw new ForbiddenError('Tu plan actual solo permite un almacén. Actualizá a PRO para crear múltiples.');
          }
        }
      }

      const warehouse = await warehouseRepository.create({
        name: req.body.name,
        address: req.body.address ?? null,
        isDefault: req.body.isDefault ?? false,
        isActive: req.body.isActive ?? true,
        companyId: req.companyId,
      } as any);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'Warehouse',
        entityId: warehouse.id,
        description: `Almacén ${warehouse.name} creado`,
      });

      res.status(201).json({
        status: 'success',
        data: warehouse,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');
      const warehouse = await warehouseRepository.findById(req.params.id);

      if (!warehouse) {
        throw new NotFoundError('Warehouse');
      }

      res.json({
        status: 'success',
        data: warehouse,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');
      const warehouses = await warehouseRepository.findAll(req.companyId);

      res.json({
        status: 'success',
        data: warehouses,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const existingWarehouse = await warehouseRepository.findById(req.params.id);
      if (!existingWarehouse) {
        throw new NotFoundError('Warehouse');
      }

      const warehouse = await warehouseRepository.update(req.params.id, {
        name: req.body.name,
        address: req.body.address,
        isDefault: req.body.isDefault,
        isActive: req.body.isActive,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'Warehouse',
        entityId: warehouse.id,
        description: `Almacén ${warehouse.name} actualizado`,
      });

      res.json({
        status: 'success',
        data: warehouse,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const existingWarehouse = await warehouseRepository.findById(req.params.id);
      if (!existingWarehouse) {
        throw new NotFoundError('Warehouse');
      }

      await warehouseRepository.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'Warehouse',
        entityId: req.params.id,
        description: `Almacén ${existingWarehouse.name} eliminado`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
