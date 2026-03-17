import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { Decimal } from '@prisma/client/runtime/library';
import { IRemitoRepository } from '../../../domain/repositories/IRemitoRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { RemitoStatus } from '../../../shared/types';
import prisma from '../../database/prisma';
import { computeDeliveryStatus } from '../../../shared/utils/deliveryStatus';
import { sendRemitoEmail } from '../../services/EmailService';

export class RemitoController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      // Validate source document items if provided and determine stockBehavior
      const { invoiceId, budgetId } = req.body;
      let stockBehaviorForRemito: 'DISCOUNT' | 'RESERVE' = 'DISCOUNT';
      let isLinked = false;

      if (invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: { items: true },
        });
        if (!invoice) throw new AppError('Factura no encontrada', 404);

        const deliveryStatus = await computeDeliveryStatus('invoiceId', invoiceId, invoice.items);
        if (deliveryStatus === 'DELIVERED') {
          throw new AppError('Toda la mercadería de esta factura ya fue entregada. No se pueden crear más remitos.', 400);
        }

        const validProductIds = new Set(invoice.items.map((i) => i.productId));
        for (const item of req.body.items) {
          if (!validProductIds.has(item.productId)) {
            throw new AppError('Uno o más productos no pertenecen a la factura seleccionada', 400);
          }
        }

        stockBehaviorForRemito = ((invoice as any).stockBehavior ?? 'DISCOUNT') as 'DISCOUNT' | 'RESERVE';
        isLinked = true;
      } else if (budgetId) {
        const budget = await prisma.budget.findUnique({
          where: { id: budgetId },
          include: { items: true },
        });
        if (!budget) throw new AppError('Presupuesto no encontrado', 404);

        const deliveryStatus = await computeDeliveryStatus('budgetId', budgetId, budget.items);
        if (deliveryStatus === 'DELIVERED') {
          throw new AppError('Toda la mercadería de este presupuesto ya fue entregada. No se pueden crear más remitos.', 400);
        }

        const validProductIds = new Set(
          budget.items.filter((i) => i.productId).map((i) => i.productId as string)
        );
        for (const item of req.body.items) {
          if (!validProductIds.has(item.productId)) {
            throw new AppError('Uno o más productos no pertenecen al presupuesto seleccionado', 400);
          }
        }

        stockBehaviorForRemito = ((budget as any).stockBehavior ?? 'DISCOUNT') as 'DISCOUNT' | 'RESERVE';
        isLinked = true;
      }

      const remito = await remitoRepository.create({
        customerId: req.body.customerId,
        userId: req.user!.userId,
        stockBehavior: stockBehaviorForRemito,
        notes: req.body.notes,
        invoiceId: invoiceId || undefined,
        budgetId: budgetId || undefined,
        companyId: req.companyId,
        items: req.body.items,
      } as any);

      // Stock movements only for standalone remitos (linked docs handled stock at creation)
      if (!isLinked) {
        const defaultWarehouse = await warehouseRepository.findDefault();
        if (!defaultWarehouse) {
          throw new AppError('No se encontró un almacén por defecto', 400);
        }
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
          companyId: req.companyId,
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

        // For RESERVE mode: discount actual stock and release reservation
        if (remito.stockBehavior === 'RESERVE') {
          await stockRepository.addMovement({
            productId: remitoItem.productId,
            warehouseId: defaultWarehouse.id,
            type: 'REMITO_OUT',
            quantity: deliverItem.quantity,
            reason: `Entrega remito ${remito.number}`,
            referenceId: remito.id,
            userId: req.user!.userId,
          });

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
        // For DISCOUNT mode: stock was already moved at invoice/budget creation (linked)
        // or at remito creation (standalone). No additional movement needed.
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

      const isLinkedRemito = !!(remito.invoiceId || remito.budgetId);

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
      } else if (!isLinkedRemito) {
        // Standalone DISCOUNT remito: revert stock moved at creation
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
      // Linked DISCOUNT remito: stock is owned by the invoice/budget, no reversal here

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

  sendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { to } = req.body;
      if (!to || typeof to !== 'string') throw new Error('Destinatario requerido');
      await sendRemitoEmail(id, to);
      res.json({ status: 'success', message: 'Correo enviado correctamente' });
    } catch (error) {
      next(error);
    }
  };
}
