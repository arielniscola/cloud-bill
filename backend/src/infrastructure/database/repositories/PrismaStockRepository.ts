import { injectable } from 'tsyringe';
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
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
      include: { product: true },
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

    return stocks.filter(
      (stock) => stock.minQuantity && stock.quantity.lessThan(stock.minQuantity)
    );
  }

  async addMovement(data: CreateStockMovementInput): Promise<StockMovement> {
    return this.prisma.$transaction(async (tx) => {
      const currentStock = await tx.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId: data.productId,
            warehouseId: data.warehouseId,
          },
        },
      });

      const previousQuantity = currentStock?.quantity ?? new Decimal(0);
      const quantity = new Decimal(data.quantity);
      let newQuantity: Decimal;

      const isOutgoing = ['SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT'].includes(data.type);

      if (isOutgoing) {
        newQuantity = previousQuantity.minus(quantity);
        if (newQuantity.lessThan(0)) {
          throw new InsufficientStockError(
            data.productId,
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
    });
  }

  async getMovements(
    filters: { productId?: string; warehouseId?: string },
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

  async transfer(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    userId?: string
  ): Promise<void> {
    await this.prisma.$transaction(async () => {
      await this.addMovement({
        productId,
        warehouseId: fromWarehouseId,
        type: 'TRANSFER_OUT',
        quantity,
        reason: `Transfer to warehouse`,
        userId,
        relatedWarehouseId: toWarehouseId,
      });

      await this.addMovement({
        productId,
        warehouseId: toWarehouseId,
        type: 'TRANSFER_IN',
        quantity,
        reason: `Transfer from warehouse`,
        userId,
        relatedWarehouseId: fromWarehouseId,
      });
    });
  }
}
