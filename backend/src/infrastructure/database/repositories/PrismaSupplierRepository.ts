import { injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { ISupplierRepository, SupplierFilters } from '../../../domain/repositories/ISupplierRepository';
import { Supplier, CreateSupplierInput, UpdateSupplierInput } from '../../../domain/entities/Supplier';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaSupplierRepository implements ISupplierRepository {
  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: SupplierFilters = {}
  ): Promise<PaginatedResult<Supplier>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { cuit: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [data, total] = await Promise.all([
      prisma.supplier.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.supplier.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<Supplier | null> {
    return prisma.supplier.findUnique({ where: { id } });
  }

  async create(data: CreateSupplierInput): Promise<Supplier> {
    return prisma.supplier.create({ data });
  }

  async update(id: string, data: UpdateSupplierInput): Promise<Supplier> {
    return prisma.supplier.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.supplier.delete({ where: { id } });
  }
}
