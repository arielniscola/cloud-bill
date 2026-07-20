import { ActivityLog, CreateActivityLogInput, ActivityAction } from '../entities/ActivityLog';
import { PaginationParams, PaginatedResult } from '../../shared/types';

export interface ActivityLogFilters {
  companyId?: string;
  userId?: string;
  action?: ActivityAction;
  entity?: string;
  entityId?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IActivityLogRepository {
  create(data: CreateActivityLogInput): Promise<ActivityLog>;
  findAll(
    pagination: PaginationParams,
    filters?: ActivityLogFilters
  ): Promise<PaginatedResult<ActivityLog>>;
  getDistinctEntities(companyId?: string): Promise<string[]>;
}
