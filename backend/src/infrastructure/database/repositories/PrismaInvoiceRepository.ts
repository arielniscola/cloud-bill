import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IInvoiceRepository, InvoiceFilters } from '../../../domain/repositories/IInvoiceRepository';
import {
  Invoice,
  InvoiceWithItems,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from '../../../domain/entities/Invoice';
import { PaginationParams, PaginatedResult, InvoiceType } from '../../../shared/types';
import prisma from '../prisma';

@injectable()
export class PrismaInvoiceRepository implements IInvoiceRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<InvoiceWithItems | null> {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        customer: true,
        user: true,
      },
    });
  }

  async findByNumber(number: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { number } });
  }

  async findAll(
    pagination: PaginationParams = { page: 1, limit: 10 },
    filters: InvoiceFilters = {}
  ): Promise<PaginatedResult<Invoice>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        where.date.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.date.lte = filters.dateTo;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          customer: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateInvoiceInput): Promise<InvoiceWithItems> {
    const invoiceNumber = await this.getNextInvoiceNumber(data.type);

    const items = data.items.map((item) => {
      const subtotal = new Decimal(item.quantity).times(item.unitPrice);
      const taxAmount = subtotal.times(item.taxRate).dividedBy(100);
      const total = subtotal.plus(taxAmount);

      return {
        productId: item.productId,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        taxRate: new Decimal(item.taxRate),
        subtotal,
        taxAmount,
        total,
      };
    });

    const subtotal = items.reduce((acc, item) => acc.plus(item.subtotal), new Decimal(0));
    const taxAmount = items.reduce((acc, item) => acc.plus(item.taxAmount), new Decimal(0));
    const total = subtotal.plus(taxAmount);

    return this.prisma.invoice.create({
      data: {
        type: data.type,
        number: invoiceNumber,
        customerId: data.customerId,
        userId: data.userId,
        dueDate: data.dueDate,
        notes: data.notes,
        subtotal,
        taxAmount,
        total,
        items: {
          create: items,
        },
      },
      include: {
        items: true,
        customer: true,
        user: true,
      },
    });
  }

  async update(id: string, data: UpdateInvoiceInput): Promise<Invoice> {
    return this.prisma.invoice.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.invoice.delete({ where: { id } });
  }

  async getNextInvoiceNumber(type: InvoiceType): Promise<string> {
    const prefix = this.getTypePrefix(type);
    const year = new Date().getFullYear();
    const paddedNumber = await this.getNextSequence(type, year);

    return `${prefix}-${year}-${paddedNumber}`;
  }

  private getTypePrefix(type: InvoiceType): string {
    const prefixes: Record<InvoiceType, string> = {
      FACTURA_A: 'FA',
      FACTURA_B: 'FB',
      FACTURA_C: 'FC',
      NOTA_CREDITO_A: 'NCA',
      NOTA_CREDITO_B: 'NCB',
      NOTA_CREDITO_C: 'NCC',
      NOTA_DEBITO_A: 'NDA',
      NOTA_DEBITO_B: 'NDB',
      NOTA_DEBITO_C: 'NDC',
    };
    return prefixes[type];
  }

  private async getNextSequence(type: InvoiceType, year: number): Promise<string> {
    const prefix = this.getTypePrefix(type);
    const pattern = `${prefix}-${year}-%`;

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        number: { startsWith: `${prefix}-${year}-` },
      },
      orderBy: { number: 'desc' },
    });

    let nextNumber = 1;
    if (lastInvoice) {
      const parts = lastInvoice.number.split('-');
      const lastNumber = parseInt(parts[parts.length - 1], 10);
      nextNumber = lastNumber + 1;
    }

    return nextNumber.toString().padStart(8, '0');
  }
}
