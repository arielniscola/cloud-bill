import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { ActivityAction } from '../../../domain/entities/ActivityLog';

export class ActivityLogController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activityLogRepository = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      const { page, limit, userId, action, entity, dateFrom, dateTo } = req.query;

      const result = await activityLogRepository.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 20 },
        {
          userId: userId as string | undefined,
          action: action as ActivityAction | undefined,
          entity: entity as string | undefined,
          dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
          dateTo: dateTo ? new Date(dateTo as string) : undefined,
        }
      );

      res.json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}
