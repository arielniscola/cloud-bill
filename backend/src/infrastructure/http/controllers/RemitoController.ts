import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IRemitoRepository } from '../../../domain/repositories/IRemitoRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { RemitoStatus } from '../../../shared/types';
import prisma from '../../database/prisma';

export class RemitoController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const remito = await remitoRepository.create({
        customerId: req.body.customerId,
        userId: req.user!.userId,
        stockBehavior: req.body.stockBehavior,
        notes: req.body.notes,
        items: req.body.items,
      });

      const defaultWarehouse = await warehouseRepository.findDefault();
      if (!defaultWarehouse) {
        throw new AppError('No se encontró un almacén por defecto', 400);
      }

      if (req.body.stockBehavior === 'DISCOUNT') {
        for (const item of remito.items) {
          await stockRepository.addMovement({
            productId: item.productId,
            warehouseId: defaultWarehouse.id,
            type: 'REMITO_OUT',
            quantity: item.quantity.toNumber(),
            reason: `Remito ${remito.number}`,
            referenceId: remito.id,
            userId: req.user!.userId,
          });
        }
      } else {
        // RESERVE: increment reservedQuantity for each item
        for (const item of remito.items) {
          await prisma.stock.upsert({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: defaultWarehouse.id,
              },
            },
            update: {
              reservedQuantity: {
                increment: item.quantity,
              },
            },
            create: {
              productId: item.productId,
              warehouseId: defaultWarehouse.id,
              quantity: new Decimal(0),
              reservedQuantity: item.quantity,
            },
          });
        }
      }

      res.status(201).json({
        status: 'success',
        data: remito,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const remito = await remitoRepository.findById(req.params.id);

      if (!remito) {
        throw new NotFoundError('Remito');
      }

      res.json({
        status: 'success',
        data: remito,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const { page, limit, ...filters } = req.query;

      const result = await remitoRepository.findAll(
        { page: Number(page) || 1, limit: Number(limit) || 10 },
        {
          customerId: filters.customerId as string,
          status: filters.status as RemitoStatus | undefined,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom as string) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo as string) : undefined,
        }
      );

      res.json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async deliver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const remito = await remitoRepository.findById(req.params.id);
      if (!remito) {
        throw new NotFoundError('Remito');
      }

      if (remito.status !== 'PENDING' && remito.status !== 'PARTIALLY_DELIVERED') {
        throw new AppError('Solo se pueden entregar remitos pendientes o parcialmente entregados', 400);
      }

      const defaultWarehouse = await warehouseRepository.findDefault();
      if (!defaultWarehouse) {
        throw new AppError('No se encontró un almacén por defecto', 400);
      }

      const deliverItems: { remitoItemId: string; quantity: number }[] = req.body.items;

      for (const deliverItem of deliverItems) {
        const remitoItem = remito.items.find((item) => item.id === deliverItem.remitoItemId);
        if (!remitoItem) {
          throw new AppError(`Item de remito ${deliverItem.remitoItemId} no encontrado`, 400);
        }

        const pendingQuantity = remitoItem.quantity.minus(remitoItem.deliveredQuantity).toNumber();
        if (deliverItem.quantity > pendingQuantity) {
          throw new AppError(
            `Cantidad a entregar (${deliverItem.quantity}) excede la cantidad pendiente (${pendingQuantity})`,
            400
          );
        }

        const newDeliveredQuantity = remitoItem.deliveredQuantity.plus(deliverItem.quantity).toNumber();
        await remitoRepository.updateItemDeliveredQuantity(remitoItem.id, newDeliveredQuantity);

        // Discount actual stock
        await stockRepository.addMovement({
          productId: remitoItem.productId,
          warehouseId: defaultWarehouse.id,
          type: 'REMITO_OUT',
          quantity: deliverItem.quantity,
          reason: `Entrega remito ${remito.number}`,
          referenceId: remito.id,
          userId: req.user!.userId,
        });

        // Release reservation
        if (remito.stockBehavior === 'RESERVE') {
          await prisma.stock.update({
            where: {
              productId_warehouseId: {
                productId: remitoItem.productId,
                warehouseId: defaultWarehouse.id,
              },
            },
            data: {
              reservedQuantity: {
                decrement: new Decimal(deliverItem.quantity),
              },
            },
          });
        }
      }

      // Recalculate status
      const updatedRemito = await remitoRepository.findById(req.params.id);
      if (!updatedRemito) {
        throw new NotFoundError('Remito');
      }

      const allDelivered = updatedRemito.items.every(
        (item) => item.deliveredQuantity.equals(item.quantity)
      );
      const someDelivered = updatedRemito.items.some(
        (item) => item.deliveredQuantity.greaterThan(0)
      );

      let newStatus: RemitoStatus;
      if (allDelivered) {
        newStatus = 'DELIVERED';
      } else if (someDelivered) {
        newStatus = 'PARTIALLY_DELIVERED';
      } else {
        newStatus = 'PENDING';
      }

      await remitoRepository.updateStatus(remito.id, newStatus);

      const finalRemito = await remitoRepository.findById(req.params.id);

      res.json({
        status: 'success',
        data: finalRemito,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      const remito = await remitoRepository.findById(req.params.id);
      if (!remito) {
        throw new NotFoundError('Remito');
      }

      if (remito.status === 'CANCELLED') {
        throw new AppError('El remito ya está cancelado', 400);
      }

      const defaultWarehouse = await warehouseRepository.findDefault();
      if (!defaultWarehouse) {
        throw new AppError('No se encontró un almacén por defecto', 400);
      }

      if (remito.stockBehavior === 'RESERVE') {
        for (const item of remito.items) {
          // Release pending reservations
          const pendingReservation = item.quantity.minus(item.deliveredQuantity);
          if (pendingReservation.greaterThan(0)) {
            await prisma.stock.update({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: defaultWarehouse.id,
                },
              },
              data: {
                reservedQuantity: {
                  decrement: pendingReservation,
                },
              },
            });
          }

          // Revert already delivered items
          if (item.deliveredQuantity.greaterThan(0)) {
            await stockRepository.addMovement({
              productId: item.productId,
              warehouseId: defaultWarehouse.id,
              type: 'RETURN',
              quantity: item.deliveredQuantity.toNumber(),
              reason: `Cancelación remito ${remito.number}`,
              referenceId: remito.id,
              userId: req.user!.userId,
            });
          }
        }
      } else {
        // DISCOUNT: revert all stock
        for (const item of remito.items) {
          if (item.deliveredQuantity.greaterThan(0)) {
            await stockRepository.addMovement({
              productId: item.productId,
              warehouseId: defaultWarehouse.id,
              type: 'RETURN',
              quantity: item.deliveredQuantity.toNumber(),
              reason: `Cancelación remito ${remito.number}`,
              referenceId: remito.id,
              userId: req.user!.userId,
            });
          }
        }
      }

      await remitoRepository.updateStatus(remito.id, 'CANCELLED');

      const updatedRemito = await remitoRepository.findById(req.params.id);

      res.json({
        status: 'success',
        data: updatedRemito,
      });
    } catch (error) {
      next(error);
    }
  }
}
