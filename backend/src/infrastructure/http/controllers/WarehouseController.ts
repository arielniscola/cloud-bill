import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class WarehouseController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const warehouse = await warehouseRepository.create({
        name: req.body.name,
        address: req.body.address ?? null,
        isDefault: req.body.isDefault ?? false,
        isActive: req.body.isActive ?? true,
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

  async findAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');
      const warehouses = await warehouseRepository.findAll();

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

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
