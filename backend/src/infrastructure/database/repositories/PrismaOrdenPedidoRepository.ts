import { injectable } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IOrdenPedidoRepository, OrdenPedidoFilters } from '../../../domain/repositories/IOrdenPedidoRepository';
import {
  OrdenPedido,
  OrdenPedidoWithItems,
  CreateOrdenPedidoInput,
  UpdateOrdenPedidoInput,
} from '../../../domain/entities/OrdenPedido';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import prisma from '../prisma';

const includeRelations = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
  },
  customer: { select: { id: true, name: true, taxId: true, email: true, address: true } },
  user: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, status: true } },
  cashRegister: { select: { id: true, name: true } },
  invoiceCashRegister: { select: { id: true, name: true } },
};

@injectable()
export class PrismaOrdenPedidoRepository implements IOrdenPedidoRepository {
  async findAll(
    pagination: PaginationParams = { page: 1, limit: 20 },
    filters: OrdenPedidoFilters = {}
  ): Promise<PaginatedResult<OrdenPedido>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    if (filters.currency) where.currency = filters.currency;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search, mode: 'insensitive' } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      (prisma as any).ordenPedido.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: { select: { id: true, name: true, taxId: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      (prisma as any).ordenPedido.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<OrdenPedidoWithItems | null> {
    return (prisma as any).ordenPedido.findUnique({
      where: { id },
      include: includeRelations,
    }) as Promise<OrdenPedidoWithItems | null>;
  }

  async create(data: CreateOrdenPedidoInput): Promise<OrdenPedidoWithItems> {
    const number = await this.getNextNumber();

    const items = data.items.map((item) => ({
      productId: item.productId ?? null,
      description: item.description,
      quantity: new Decimal(item.quantity),
      unitPrice: new Decimal(item.unitPrice),
      taxRate: new Decimal(item.taxRate),
      subtotal: new Decimal(item.subtotal),
      taxAmount: new Decimal(item.taxAmount),
      total: new Decimal(item.total),
    }));

    return (prisma as any).ordenPedido.create({
      data: {
        number,
        customerId: data.customerId ?? null,
        userId: data.userId,
        dueDate: data.dueDate ?? null,
        currency: data.currency,
        exchangeRate: new Decimal(data.exchangeRate),
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        saleCondition: data.saleCondition ?? 'CONTADO',
        stockBehavior: data.stockBehavior ?? 'DISCOUNT',
        companyId: (data as any).companyId ?? '00000000-0000-0000-0000-000000000001',
        cashRegisterId: (data as any).cashRegisterId ?? null,
        invoiceCashRegisterId: (data as any).invoiceCashRegisterId ?? null,
        subtotal: new Decimal(data.subtotal),
        taxAmount: new Decimal(data.taxAmount),
        total: new Decimal(data.total),
        items: { create: items },
      },
      include: includeRelations,
    }) as Promise<OrdenPedidoWithItems>;
  }

  async update(id: string, data: UpdateOrdenPedidoInput): Promise<OrdenPedidoWithItems> {
    const { items, ...rest } = data;

    if (items) {
      await (prisma as any).ordenPedidoItem.deleteMany({ where: { ordenPedidoId: id } });
      await (prisma as any).ordenPedido.update({
        where: { id },
        data: {
          ...rest,
          items: {
            create: items.map((item) => ({
              productId: item.productId ?? null,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              taxRate: new Decimal(item.taxRate),
              subtotal: new Decimal(item.subtotal),
              taxAmount: new Decimal(item.taxAmount),
              total: new Decimal(item.total),
            })),
          },
        },
      });
    } else {
      await (prisma as any).ordenPedido.update({ where: { id }, data: rest });
    }

    return this.findById(id) as Promise<OrdenPedidoWithItems>;
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).ordenPedido.delete({ where: { id } });
  }

  async getNextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await (prisma as any).ordenPedido.count({
      where: { number: { startsWith: `OP-${year}-` } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `OP-${year}-${seq}`;
  }
}
