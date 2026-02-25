import { ActivityLog, CreateActivityLogInput, ActivityAction } from '../entities/ActivityLog';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ActivityLogFilters {
  userId?: string;
  action?: ActivityAction;
  entity?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IActivityLogRepository {
  create(data: CreateActivityLogInput): Promise<ActivityLog>;
  findAll(
    pagination: PaginationParams,
    filters?: ActivityLogFilters
  ): Promise<PaginatedResult<ActivityLog>>;
}
