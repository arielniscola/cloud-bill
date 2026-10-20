import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { IRemitoRepository } from '../../../domain/repositories/IRemitoRepository';
import { IStockRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { RemitoStatus } from '../../../shared/types';
import prisma from '../../database/prisma';
import { computeDeliveryStatus } from '../../../shared/utils/deliveryStatus';
import { resolveSaleWarehouse, setSaleWarehouse } from '../../../shared/utils/saleWarehouse';
import { sendRemitoEmail } from '../../services/EmailService';
import { readTransport, writeTransport } from '../../database/partyExtras';
import { findBilledInvoicesFor, findUnbilledRemitoIds } from '../../../shared/utils/billedRemitos';
import { LotPool, loadLotSelections, saveLotSelections, selectionsFromItems, stripItemLots, LotSelection } from '../../../shared/utils/lotSelections';
import { lotsDeliveredByReference } from '../../database/repositories/stockLots';

// Depósito donde opera el remito: el del documento de venta vinculado
// (factura u orden de pedido), el elegido en el remito libre o el depósito
// por defecto de la empresa.
async function resolveRemitoWarehouse(remito: any, companyId?: string) {
  if (remito.invoiceId) return resolveSaleWarehouse('invoices', remito.invoiceId, companyId);
  if (remito.ordenPedidoId) return resolveSaleWarehouse('orden_pedidos', remito.ordenPedidoId, companyId);
  return resolveSaleWarehouse('remitos', remito.id, companyId);
}

/**
 * Lo elegido al crear el remito menos lo que ya salió de cada lote en entregas
 * anteriores (por número de lote, que es lo que devuelve la trazabilidad).
 */
async function subtractDeliveredLots(
  stored: LotSelection[],
  delivered: { productId: string; variantId: string | null; lotNumber: string; quantity: number }[],
): Promise<LotSelection[]> {
  const ids = stored.flatMap((s) => s.lots.map((l) => l.lotId));
  if (ids.length === 0) return stored;
  const rows = await prisma.$queryRaw<{ id: string; lotNumber: string }[]>`
    SELECT id, "lotNumber" FROM "stock_lots" WHERE id IN (${Prisma.join(ids)})
  `;
  const numberOf = new Map(rows.map((r) => [r.id, r.lotNumber]));
  return stored.map((s) => ({
    ...s,
    lots: s.lots
      .map((l) => {
        const done = delivered.find((d) => d.productId === s.productId && (d.variantId ?? null) === (s.variantId ?? null)
          && d.lotNumber === numberOf.get(l.lotId));
        return { ...l, quantity: Math.max(0, l.quantity - (done?.quantity ?? 0)) };
      })
      .filter((l) => l.quantity > 0),
  }));
}

export class RemitoController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const stockRepository = container.resolve<IStockRepository>('StockRepository');
      const warehouseRepository = container.resolve<IWarehouseRepository>('WarehouseRepository');

      // Validate source document items if provided and determine stockBehavior + fiscalMode
      const { invoiceId, budgetId, ordenPedidoId: linkedOrdenPedidoId } = req.body;
      let stockBehaviorForRemito: 'DISCOUNT' | 'RESERVE' = 'DISCOUNT';
      let fiscalModeForRemito: 'FORMAL' | 'INFORMAL' = req.fiscalMode ?? 'FORMAL';
      let isLinked = false;

      if (linkedOrdenPedidoId) {
        // Remito linked to an OP: stock was already handled at OP creation
        const op = await (prisma as any).ordenPedido.findUnique({ where: { id: linkedOrdenPedidoId } });
        if (!op) throw new AppError('Orden de pedido no encontrada', 404);
        stockBehaviorForRemito = (op.stockBehavior ?? 'DISCOUNT') as 'DISCOUNT' | 'RESERVE';
        fiscalModeForRemito = (op.fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
        isLinked = true;
      } else if (invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: { items: true },
        });
        if (!invoice) throw new AppError('Factura no encontrada', 404);

        // Un borrador no movió stock (los efectos se aplican al emitir):
        // entregar por remito descontaría mercadería que nunca se descontó.
        if (invoice.status === 'DRAFT') {
          throw new AppError('La factura está en borrador: emitila antes de generar un remito.', 400);
        }
        if (invoice.status === 'CANCELLED') {
          throw new AppError('No se puede generar un remito de una factura cancelada.', 400);
        }

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
        fiscalModeForRemito = ((invoice as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
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
        fiscalModeForRemito = ((budget as any).fiscalMode ?? 'FORMAL') as 'FORMAL' | 'INFORMAL';
        isLinked = true;
      }

      // Remito libre: descuenta del depósito elegido (o del de por defecto).
      let standaloneWarehouseId: string | null = null;
      if (!isLinked) {
        const warehouse = req.body.warehouseId
          ? await warehouseRepository.findById(req.body.warehouseId, req.companyId)
          : await warehouseRepository.findDefaultOrFirstActive(req.companyId);
        if (!warehouse) {
          throw new AppError(
            req.body.warehouseId ? 'Depósito no encontrado' : 'No se encontró un almacén por defecto',
            req.body.warehouseId ? 404 : 400
          );
        }
        if (!warehouse.isActive) throw new AppError('El depósito seleccionado está inactivo', 400);
        standaloneWarehouseId = warehouse.id;
      }

      // Remito + descuento de stock en una sola transacción: si falta stock de
      // algún ítem no queda un remito creado sin su movimiento.
      // Lotes elegidos por línea: se guardan en el remito y se usan al mover stock
      // (al crear el libre, o al entregar el que reserva).
      const lotSelections = selectionsFromItems(req.body.items);
      const remito = await prisma.$transaction(async (tx) => {
        const created = await remitoRepository.create({
          customerId: req.body.customerId,
          userId: req.user!.userId,
          stockBehavior: stockBehaviorForRemito,
          notes: req.body.notes,
          invoiceId: invoiceId || undefined,
          budgetId: budgetId || undefined,
          ordenPedidoId: linkedOrdenPedidoId || undefined,
          companyId: req.companyId,
          fiscalMode: fiscalModeForRemito,
          items: stripItemLots(req.body.items),
        } as any, tx);
        if (lotSelections.length) await saveLotSelections('remitos', created.id, lotSelections, tx);

        // Stock movements only for standalone remitos (linked docs handled stock at creation)
        if (standaloneWarehouseId) {
          await setSaleWarehouse('remitos', created.id, standaloneWarehouseId, tx);
          const pool = new LotPool(lotSelections);
          for (const item of created.items) {
            await stockRepository.addMovement({
              productId: item.productId,
              variantId: (item as any).variantId ?? null,
              warehouseId: standaloneWarehouseId,
              type: 'REMITO_OUT',
              quantity: item.quantity.toNumber(),
              reason: `Remito ${created.number}`,
              referenceId: created.id,
              userId: req.user!.userId,
              lots: pool.take(item.productId, (item as any).variantId ?? null, item.quantity.toNumber()),
            }, tx);
          }
        }
        return created;
      });

      const transport = req.body.transport !== undefined
        ? req.body.transport
        : (invoiceId ? await readTransport('invoices', invoiceId) : undefined);
      await writeTransport('remitos', remito.id, transport ?? undefined);

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
      const remito = await remitoRepository.findById(req.params.id, req.companyId);

      if (!remito) {
        throw new NotFoundError('Remito');
      }

      const billedInvoice = (await findBilledInvoicesFor([remito.id]))[remito.id] ?? null;

      res.json({
        status: 'success',
        data: { ...remito, billedInvoice },
      });
    } catch (error) {
      next(error);
    }
  }

  /** Remitos libres del cliente pendientes de facturar (con ítems y productos). */
  async findUnbilled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = String(req.query.customerId ?? '');
      if (!customerId) throw new AppError('customerId es requerido', 400);
      const ids = await findUnbilledRemitoIds(req.companyId!, customerId);
      const remitos = ids.length === 0 ? [] : await prisma.remito.findMany({
        where: { id: { in: ids } },
        include: { items: { include: { product: true } }, customer: true },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
      });
      res.json({ status: 'success', data: remitos });
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
          fiscalMode: req.fiscalMode,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom as string) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo as string) : undefined,
          ordenPedidoId: filters.ordenPedidoId as string | undefined,
          invoiceId: filters.invoiceId as string | undefined,
          budgetId: filters.budgetId as string | undefined,
        }
      );

      const billed = await findBilledInvoicesFor(result.data.map((r) => r.id));

      res.json({
        status: 'success',
        ...result,
        data: result.data.map((r) => ({ ...r, billedInvoice: billed[r.id] ?? null })),
      });
    } catch (error) {
      next(error);
    }
  }

  async deliver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const remitoRepository = container.resolve<IRemitoRepository>('RemitoRepository');
      const stockRepository = container.resolve<IStockRepository>('StockRepository');

      const remito = await remitoRepository.findById(req.params.id, req.companyId);
      if (!remito) {
        throw new NotFoundError('Remito');
      }

      if (remito.status !== 'PENDING' && remito.status !== 'PARTIALLY_DELIVERED') {
        throw new AppError('Solo se pueden entregar remitos pendientes o parcialmente entregados', 400);
      }

      const defaultWarehouse = await resolveRemitoWarehouse(remito, req.companyId);
      if (!defaultWarehouse) {
        throw new AppError('No se encontró un almacén por defecto', 400);
      }

      const deliverItems: { remitoItemId: string; quantity: number; lots?: { lotId: string; quantity: number }[] }[] = req.body.items;

      // Lotes: lo elegido en esta entrega, si no lo que quedó elegido al crear el
      // remito menos lo que ya se entregó de cada lote.
      let pool: LotPool | null = null;
      if (remito.stockBehavior === 'RESERVE') {
        const explicit = deliverItems
          .map((d) => {
            const ri = remito.items.find((i) => i.id === d.remitoItemId);
            return ri ? { productId: ri.productId, variantId: (ri as any).variantId ?? null, lots: d.lots } : null;
          })
          .filter(Boolean) as { productId: string; variantId: string | null; lots?: { lotId: string; quantity: number }[] }[];
        const chosen = selectionsFromItems(explicit);
        if (chosen.length) {
          pool = new LotPool(chosen);
        } else {
          const stored = await loadLotSelections('remitos', remito.id);
          if (stored.length) {
            const delivered = await lotsDeliveredByReference(prisma, [remito.id]);
            pool = new LotPool(await subtractDeliveredLots(stored, delivered));
          }
        }
      }

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
          const itemVariantId = (remitoItem as any).variantId ?? null;
          await stockRepository.addMovement({
            productId: remitoItem.productId,
            variantId: itemVariantId,
            warehouseId: defaultWarehouse.id,
            type: 'REMITO_OUT',
            quantity: deliverItem.quantity,
            reason: `Entrega remito ${remito.number}`,
            referenceId: remito.id,
            userId: req.user!.userId,
            lots: pool?.take(remitoItem.productId, itemVariantId, deliverItem.quantity),
          });

          await stockRepository.decrementReserved(
            remitoItem.productId,
            defaultWarehouse.id,
            deliverItem.quantity,
            itemVariantId,
          );
        }
        // For DISCOUNT mode: stock was already moved at invoice/budget creation (linked)
        // or at remito creation (standalone). No additional movement needed.
      }

      // Recalculate status
      const updatedRemito = await remitoRepository.findById(req.params.id, req.companyId);
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

      const finalRemito = await remitoRepository.findById(req.params.id, req.companyId);

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

      const remito = await remitoRepository.findById(req.params.id, req.companyId);
      if (!remito) {
        throw new NotFoundError('Remito');
      }

      if (remito.status === 'CANCELLED') {
        throw new AppError('El remito ya está cancelado', 400);
      }

      const billedInvoice = (await findBilledInvoicesFor([remito.id]))[remito.id];
      if (billedInvoice) {
        throw new AppError(
          `El remito está facturado en ${billedInvoice.number}. Anulá esa factura (o hacé una nota de crédito) antes de anular el remito.`,
          400
        );
      }

      const defaultWarehouse = await resolveRemitoWarehouse(remito, req.companyId);
      if (!defaultWarehouse) {
        throw new AppError('No se encontró un almacén por defecto', 400);
      }

      const isLinkedRemito = !!(remito.invoiceId || remito.budgetId || (remito as any).ordenPedidoId);

      if (remito.stockBehavior === 'RESERVE') {
        for (const item of remito.items) {
          const itemVariantId = (item as any).variantId ?? null;
          // Release pending reservations
          const pendingReservation = item.quantity.minus(item.deliveredQuantity);
          if (pendingReservation.greaterThan(0)) {
            await stockRepository.decrementReserved(
              item.productId,
              defaultWarehouse.id,
              pendingReservation.toNumber(),
              itemVariantId,
            );
          }

          // Revert already delivered items
          if (item.deliveredQuantity.greaterThan(0)) {
            await stockRepository.addMovement({
              productId: item.productId,
              variantId: itemVariantId,
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
              variantId: (item as any).variantId ?? null,
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

      const updatedRemito = await remitoRepository.findById(req.params.id, req.companyId);

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
      const { to, pdfBase64 } = req.body;
      if (!to || typeof to !== 'string') throw new AppError('Destinatario requerido', 400);
      await sendRemitoEmail(id, to, req.companyId!, pdfBase64);
      res.json({ status: 'success', message: 'Correo enviado correctamente' });
    } catch (error) {
      next(error);
    }
  };
}
