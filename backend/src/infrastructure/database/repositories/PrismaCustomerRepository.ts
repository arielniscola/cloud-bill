import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ICustomerRepository,
  CustomerFilters,
} from '../../../domain/repositories/ICustomerRepository';
import { Customer, CreateCustomerInput, UpdateCustomerInput } from '../../../domain/entities/Customer';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

type RawSaleCondition = { id: string; saleCondition: string };

@injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  private async getSaleCondition(id: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ saleCondition: string }[]>(
      Prisma.sql`SELECT "saleCondition" FROM customers WHERE id = ${id}`
    );
    return rows[0]?.saleCondition ?? 'CONTADO';
  }

  async findById(id: string): Promise<Customer | null> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) return null;
    const saleCondition = await this.getSaleCondition(id);
    return { ...(customer as any), saleCondition } as Customer;
  }

  async findByTaxId(taxId: string): Promise<Customer | null> {
    const customer = await this.prisma.customer.findUnique({ where: { taxId } });
    if (!customer) return null;
    const saleCondition = await this.getSaleCondition(customer.id);
    return { ...(customer as any), saleCondition } as Customer;
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

    if (filters.companyId) {
      (where as any).companyId = filters.companyId;
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

    // Fetch saleCondition via raw query (bypass stale Prisma client types)
    const scMap = new Map<string, string>();
    if (data.length > 0) {
      const scRows = await this.prisma.$queryRaw<RawSaleCondition[]>(
        Prisma.sql`SELECT id, "saleCondition" FROM customers WHERE id IN (${Prisma.join(data.map(c => c.id))})`
      );
      for (const r of scRows) scMap.set(r.id, r.saleCondition);
    }

    return {
      data: (data as any[]).map(c => ({ ...c, saleCondition: scMap.get(c.id) ?? 'CONTADO' })) as Customer[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateCustomerInput): Promise<Customer> {
    const { saleCondition = 'CONTADO', companyId, ...rest } = data as any;
    const created = await this.prisma.customer.create({ data: rest });
    const resolvedCompanyId = companyId;
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE customers SET "saleCondition" = ${saleCondition}, "companyId" = ${resolvedCompanyId} WHERE id = ${created.id}`
    );
    return { ...(created as any), saleCondition, companyId: resolvedCompanyId } as Customer;
  }

  async update(id: string, data: UpdateCustomerInput): Promise<Customer> {
    const { saleCondition, ...rest } = data as any;
    const updated = await this.prisma.customer.update({ where: { id }, data: rest });
    if (saleCondition !== undefined) {
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE customers SET "saleCondition" = ${saleCondition} WHERE id = ${id}`
      );
      return { ...(updated as any), saleCondition } as Customer;
    }
    const currentSC = await this.getSaleCondition(id);
    return { ...(updated as any), saleCondition: currentSC } as Customer;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.customer.delete({ where: { id } });
  }
}
