import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { IActivityLogRepository, ActivityLogFilters } from '../../../domain/repositories/IActivityLogRepository';
import { ActivityLog, CreateActivityLogInput } from '../../../domain/entities/ActivityLog';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import { companyHasFeature } from '../../http/middlewares/featureMiddleware';
import prisma from '../prisma';

@injectable()
export class PrismaActivityLogRepository implements IActivityLogRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async create(data: CreateActivityLogInput): Promise<ActivityLog> {
    try {
      // Resolve companyId: use explicit one if provided, otherwise look up from user
      const companyId = data.companyId ?? await this._getCompanyIdForUser(data.userId);
      if (companyId) {
        const allowed = await companyHasFeature(companyId, 'activity_log');
        if (!allowed) return {} as ActivityLog;
      }

      return await this.prisma.activityLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          description: data.description,
          metadata: data.metadata as Prisma.InputJsonValue | undefined,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }) as unknown as ActivityLog;
    } catch {
      // Activity logging is non-critical — never propagate errors to callers
      return {} as ActivityLog;
    }
  }

  async findAll(
    pagination: PaginationParams,
    filters: ActivityLogFilters = {}
  ): Promise<PaginatedResult<ActivityLog>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityLogWhereInput = {};
    if (filters.companyId) where.user = { companyId: filters.companyId };
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.search) {
      where.description = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      data: data as unknown as ActivityLog[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDistinctEntities(companyId?: string): Promise<string[]> {
    const rows = companyId
      ? await this.prisma.$queryRaw<{ entity: string }[]>`
          SELECT DISTINCT al.entity
          FROM activity_logs al
          JOIN "users" u ON u.id = al."userId"
          WHERE u."companyId" = ${companyId}
          ORDER BY al.entity
        `
      : await this.prisma.$queryRaw<{ entity: string }[]>`
          SELECT DISTINCT entity FROM activity_logs ORDER BY entity
        `;
    return rows.map((r) => r.entity);
  }

  private async _getCompanyIdForUser(userId: string): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRaw<{ companyId: string | null }[]>`
        SELECT "companyId" FROM "users" WHERE id = ${userId} LIMIT 1
      `;
      return rows[0]?.companyId ?? null;
    } catch {
      return null;
    }
  }
}
