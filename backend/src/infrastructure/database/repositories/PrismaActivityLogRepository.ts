import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { IActivityLogRepository, ActivityLogFilters } from '../../../domain/repositories/IActivityLogRepository';
import { ActivityLog, CreateActivityLogInput } from '../../../domain/entities/ActivityLog';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaActivityLogRepository implements IActivityLogRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async create(data: CreateActivityLogInput): Promise<ActivityLog> {
    return this.prisma.activityLog.create({
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
  }

  async findAll(
    pagination: PaginationParams,
    filters: ActivityLogFilters = {}
  ): Promise<PaginatedResult<ActivityLog>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityLogWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;
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
}
