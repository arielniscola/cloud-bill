import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IOrdenCompraRepository, OrdenCompraFilters } from '../../../domain/repositories/IOrdenCompraRepository';
import {
  OrdenCompra,
  OrdenCompraWithItems,
  CreateOrdenCompraInput,
  UpdateOrdenCompraInput,
} from '../../../domain/entities/OrdenCompra';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (prisma as any);

const includeRelations = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
  },
  supplier: { select: { id: true, name: true, email: true } },
  user:     { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  purchase:  { select: { id: true } },
};

@injectable()
export class PrismaOrdenCompraRepository implements IOrdenCompraRepository {
  async findAll(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: OrdenCompraFilters = {}
  ): Promise<PaginatedResult<OrdenCompra>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.status)     where.status     = filters.status;
    if (filters.companyId)  where.companyId  = filters.companyId;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo)   where.date.lte = filters.dateTo;
    }

    const [data, total] = await Promise.all([
      db.ordenCompra.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          user:     { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      db.ordenCompra.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<OrdenCompraWithItems | null> {
    return db.ordenCompra.findUnique({
      where: { id },
      include: includeRelations,
    }) as Promise<OrdenCompraWithItems | null>;
  }

  async create(data: CreateOrdenCompraInput): Promise<OrdenCompraWithItems> {
    const number = await this.getNextNumber();

    const items = data.items.map((item) => ({
      productId:   item.productId ?? null,
      description: item.description,
      quantity:    new Decimal(item.quantity),
      unitPrice:   new Decimal(item.unitPrice),
      taxRate:     new Decimal(item.taxRate),
      subtotal:    new Decimal(item.subtotal),
      taxAmount:   new Decimal(item.taxAmount),
      total:       new Decimal(item.total),
    }));

    return db.ordenCompra.create({
      data: {
        number,
        supplierId:   data.supplierId,
        userId:       data.userId,
        date:         data.date ?? new Date(),
        expectedDate: data.expectedDate ?? null,
        currency:     data.currency ?? 'ARS',
        exchangeRate: new Decimal(data.exchangeRate ?? 1),
        warehouseId:  data.warehouseId ?? null,
        notes:        data.notes ?? null,
        companyId:    (data as any).companyId ?? '00000000-0000-0000-0000-000000000001',
        subtotal:     new Decimal(data.subtotal),
        taxAmount:    new Decimal(data.taxAmount),
        total:        new Decimal(data.total),
        items:        { create: items },
      },
      include: includeRelations,
    }) as Promise<OrdenCompraWithItems>;
  }

  async update(id: string, data: UpdateOrdenCompraInput): Promise<OrdenCompraWithItems> {
    const { items, ...rest } = data;

    if (items) {
      await db.ordenCompraItem.deleteMany({ where: { ordenCompraId: id } });
      await db.ordenCompra.update({
        where: { id },
        data: {
          ...rest,
          items: {
            create: items.map((item) => ({
              productId:   item.productId ?? null,
              description: item.description,
              quantity:    new Decimal(item.quantity),
              unitPrice:   new Decimal(item.unitPrice),
              taxRate:     new Decimal(item.taxRate),
              subtotal:    new Decimal(item.subtotal),
              taxAmount:   new Decimal(item.taxAmount),
              total:       new Decimal(item.total),
            })),
          },
        },
      });
    } else {
      await db.ordenCompra.update({ where: { id }, data: rest });
    }

    return this.findById(id) as Promise<OrdenCompraWithItems>;
  }

  async delete(id: string): Promise<void> {
    await db.ordenCompra.delete({ where: { id } });
  }

  async getNextNumber(): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await db.ordenCompra.count({
      where: { number: { startsWith: `OC-${year}-` } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `OC-${year}-${seq}`;
  }
}
