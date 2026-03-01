import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IStockRepository, BulkAdjustItem } from '../../../domain/repositories/IWarehouseRepository';
import { Stock, StockMovement, CreateStockMovementInput } from '../../../domain/entities/Stock';
import { PaginationParams, PaginatedResult } from '../../../shared/types';
import { InsufficientStockError } from '../../../shared/errors/AppError';
import prisma from '../prisma';

@injectable()
export class PrismaStockRepository implements IStockRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async getStock(productId: string, warehouseId: string): Promise<Stock | null> {
    return this.prisma.stock.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      include: { product: true, warehouse: true },
    });
  }

  async getStockByProduct(productId: string): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { productId },
      include: { warehouse: true },
    });
  }

  async getStockByWarehouse(warehouseId: string): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { warehouseId },
      include: { product: { include: { category: true, brand: true } } },
      orderBy: { product: { name: 'asc' } },
    });
  }

  async updateStock(productId: string, warehouseId: string, quantity: number): Promise<Stock> {
    return this.prisma.stock.upsert({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      update: { quantity: new Decimal(quantity) },
      create: {
        productId,
        warehouseId,
        quantity: new Decimal(quantity),
      },
    });
  }

  async setMinQuantity(
    productId: string,
    warehouseId: string,
    minQuantity: number | null
  ): Promise<Stock> {
    return this.prisma.stock.update({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      data: {
        minQuantity: minQuantity !== null ? new Decimal(minQuantity) : null,
      },
    });
  }

  async getLowStockItems(warehouseId?: string): Promise<Stock[]> {
    const where: Prisma.StockWhereInput = {
      minQuantity: { not: null },
    };

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const stocks = await this.prisma.stock.findMany({
      where,
      include: { product: true, warehouse: true },
    });

    return stocks.filter((stock) => {
      if (!stock.minQuantity) return false;
      const available = stock.quantity.minus(stock.reservedQuantity);
      return available.lessThan(stock.minQuantity);
    });
  }

  private async _addMovementWithTx(
    tx: Prisma.TransactionClient,
    data: CreateStockMovementInput
  ): Promise<StockMovement> {
    const currentStock = await tx.stock.findUnique({
      where: {
        productId_warehouseId: {
          productId: data.productId,
          warehouseId: data.warehouseId,
        },
      },
      include: { product: true },
    });

    const previousQuantity = currentStock?.quantity ?? new Decimal(0);
    const quantity = new Decimal(data.quantity);
    let newQuantity: Decimal;

    const isOutgoing = ['SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'REMITO_OUT'].includes(data.type);

    if (isOutgoing) {
      newQuantity = previousQuantity.minus(quantity);
      if (newQuantity.lessThan(0)) {
        const productName = currentStock?.product?.name ?? data.productId;
        throw new InsufficientStockError(
          productName,
          previousQuantity.toNumber(),
          quantity.toNumber()
        );
      }
    } else {
      newQuantity = previousQuantity.plus(quantity);
    }

    await tx.stock.upsert({
      where: {
        productId_warehouseId: {
          productId: data.productId,
          warehouseId: data.warehouseId,
        },
      },
      update: { quantity: newQuantity },
      create: {
        productId: data.productId,
        warehouseId: data.warehouseId,
        quantity: newQuantity,
      },
    });

    return tx.stockMovement.create({
      data: {
        productId: data.productId,
        warehouseId: data.warehouseId,
        type: data.type,
        quantity,
        previousQuantity,
        newQuantity,
        reason: data.reason,
        referenceId: data.referenceId,
        userId: data.userId,
        relatedWarehouseId: data.relatedWarehouseId,
      },
    });
  }

  async addMovement(data: CreateStockMovementInput): Promise<StockMovement> {
    return this.prisma.$transaction((tx) => this._addMovementWithTx(tx, data));
  }

  async getMovements(
    filters: { productId?: string; warehouseId?: string; type?: string; startDate?: string; endDate?: string },
    pagination: PaginationParams = { page: 1, limit: 10 }
  ): Promise<PaginatedResult<StockMovement>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    if (filters.type) {
      where.type = filters.type as any;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { product: true, warehouse: true, user: true },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async adjustBulk(
    warehouseId: string,
    items: BulkAdjustItem[],
    reason: string,
    userId?: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const currentStock = await tx.stock.findUnique({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        });

        const currentQty = currentStock?.quantity ?? new Decimal(0);
        const newQty = new Decimal(item.newQuantity);
        const diff = newQty.minus(currentQty);

        if (diff.isZero()) continue;

        const type = diff.greaterThan(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        await this._addMovementWithTx(tx, {
          productId: item.productId,
          warehouseId,
          type,
          quantity: diff.abs().toNumber(),
          reason,
          userId,
        });
      }
    });
  }

  async exportWarehouseStock(warehouseId: string): Promise<string> {
    const stocks = await this.prisma.stock.findMany({
      where: { warehouseId },
      include: { product: { include: { category: true, brand: true } } },
      orderBy: { product: { name: 'asc' } },
    });

    const header = 'SKU,Nombre,Categoría,Marca,Stock Total,Reservado,Disponible,Stock Mínimo,Costo Unitario,Valor Total';

    const rows = stocks.map((stock) => {
      const available = stock.quantity.minus(stock.reservedQuantity);
      const totalValue = stock.quantity.mul(stock.product.cost);
      return [
        stock.product.sku,
        `"${stock.product.name.replace(/"/g, '""')}"`,
        stock.product.category?.name ?? '',
        stock.product.brand?.name ?? '',
        stock.quantity.toNumber(),
        stock.reservedQuantity.toNumber(),
        available.toNumber(),
        stock.minQuantity?.toNumber() ?? '',
        stock.product.cost.toNumber(),
        totalValue.toNumber(),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  async transfer(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this._addMovementWithTx(tx, {
        productId,
        warehouseId: fromWarehouseId,
        type: 'TRANSFER_OUT',
        quantity,
        reason: 'Transfer to warehouse',
        userId,
        relatedWarehouseId: toWarehouseId,
      });

      await this._addMovementWithTx(tx, {
        productId,
        warehouseId: toWarehouseId,
        type: 'TRANSFER_IN',
        quantity,
        reason: 'Transfer from warehouse',
        userId,
        relatedWarehouseId: fromWarehouseId,
      });
    });
  }
}
