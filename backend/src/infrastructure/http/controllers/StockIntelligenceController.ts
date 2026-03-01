import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IStockIntelligenceRepository } from '../../../domain/repositories/IStockIntelligenceRepository';

export class StockIntelligenceController {
  async getInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IStockIntelligenceRepository>('StockIntelligenceRepository');

      const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
      const days        = req.query.days ? parseInt(req.query.days as string, 10) : 30;

      if (isNaN(days) || days < 1 || days > 365) {
        res.status(400).json({ status: 'error', message: 'days debe estar entre 1 y 365' });
        return;
      }

      const result = await repo.getInsights({ warehouseId, days });
      res.json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }
}
