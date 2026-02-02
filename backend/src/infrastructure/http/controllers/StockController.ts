import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

export class StockController {
  async getStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const { productId, warehouseId } = req.params;

      const stock = await stockRepository.getStock(productId, warehouseId);

      if (!stock) {
        throw new NotFoundError('Stock');
      }

      res.json({
        status: 'success',
        data: { stock },
      });
    } catch (error) {
      next(error);
    }
  }

  async getStockByProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const stocks = await stockRepository.getStockByProduct(req.params.productId);

      res.json({
        status: 'success',
        data: { stocks },
      });
    } catch (error) {
      next(error);
    }
  }

  async getStockByWarehouse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const stocks = await stockRepository.getStockByWarehouse(req.params.warehouseId);

      res.json({
        status: 'success',
        data: { stocks },
      });
    } catch (error) {
      next(error);
    }
  }

  async addMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');

      const movement = await stockRepository.addMovement({
        productId: req.body.productId,
        warehouseId: req.body.warehouseId,
        type: req.body.type,
        quantity: req.body.quantity,
        reason: req.body.reason,
        userId: req.user?.userId,
      });

      res.status(201).json({
        status: 'success',
        data: { movement },
      });
    } catch (error) {
      next(error);
    }
  }

  async transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');

      await stockRepository.transfer(
        req.body.productId,
        req.body.fromWarehouseId,
        req.body.toWarehouseId,
        req.body.quantity,
        req.user?.userId
      );

      res.json({
        status: 'success',
        message: 'Transfer completed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const { page, limit, productId, warehouseId } = req.query;

      const result = await stockRepository.getMovements(
        {
          productId: productId as string,
          warehouseId: warehouseId as string,
        },
        { page: Number(page) || 1, limit: Number(limit) || 10 }
      );

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getLowStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const { warehouseId } = req.query;

      const stocks = await stockRepository.getLowStockItems(warehouseId as string);

      res.json({
        status: 'success',
        data: { stocks },
      });
    } catch (error) {
      next(error);
    }
  }

  async setMinQuantity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const { productId, warehouseId } = req.params;

      const stock = await stockRepository.setMinQuantity(
        productId,
        warehouseId,
        req.body.minQuantity
      );

      res.json({
        status: 'success',
        data: { stock },
      });
    } catch (error) {
      next(error);
    }
  }
}
