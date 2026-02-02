import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ICustomerRepository,
  CustomerFilters,
} from '../../../domain/repositories/ICustomerRepository';
import { Customer, CreateCustomerInput, UpdateCustomerInput } from '../../../domain/entities/Customer';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  async findByTaxId(taxId: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { taxId } });
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: CustomerFilters = {}
  ): Promise<PaginatedResult<Customer>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { taxId: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.taxCondition) {
      where.taxCondition = filters.taxCondition as Customer['taxCondition'];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateCustomerInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  async update(id: string, data: UpdateCustomerInput): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.customer.delete({ where: { id } });
  }
}
