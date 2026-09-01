import { Request, Response, NextFunction } from 'express';
import prisma from '../../database/prisma';

/**
 * Snapshot de catálogo para la caché offline del navegador (PWA).
 *
 * Es el primo chico de SyncController.export: sólo trae lo indispensable para
 * VENDER sin conexión (catálogo, precios, stock, clientes y cabecera de la
 * empresa). Nada de facturas, compras, contabilidad ni movimientos.
 *
 * Diferencias deliberadas con SyncController.export:
 *  - `syncedAt` se toma ANTES de las queries. Si se toma después, todo lo que
 *    se escriba mientras corren las consultas queda por debajo del cursor y no
 *    vuelve nunca más.
 *  - Devuelve `counts` en cada respuesta: el cliente compara contra lo que tiene
 *    guardado y, si no coincide, pide un snapshot completo. Es la forma barata
 *    de enterarse de los DELETE, que un delta por `updatedAt` jamás propaga.
 */
export class CatalogSnapshotController {
  async snapshot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId;
      if (!companyId) {
        res.status(403).json({ status: 'error', message: 'No companyId in token' });
        return;
      }

      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam ? new Date(sinceParam) : undefined;
      if (sinceParam && isNaN(since!.getTime())) {
        res.status(400).json({ status: 'error', message: 'Invalid "since" date format' });
        return;
      }

      // Cursor tomado ANTES de leer: preferimos reenviar un registro de más en
      // el próximo delta a perderlo para siempre.
      const syncedAt = new Date().toISOString();
      const touched = since ? { gte: since } : undefined;

      const [
        products,
        productVariants,
        customers,
        stocks,
        warehouses,
        company,
        afipConfig,
        appSettings,
        counts,
      ] = await Promise.all([
        prisma.product.findMany({
          where: { companyId, ...(touched && { updatedAt: touched }) },
          select: {
            id: true,
            sku: true,
            name: true,
            barcode: true,
            unit: true,
            price: true,
            salePriceUSD: true,
            taxRate: true,
            trackStock: true,
            isActive: true,
            rubroId: true,
            brandId: true,
            categoryId: true,
            priceUpdatedAt: true,
            updatedAt: true,
          },
        }),
        prisma.productVariant.findMany({
          where: { companyId, ...(touched && { updatedAt: touched }) },
          select: {
            id: true,
            productId: true,
            sku: true,
            name: true,
            attributes: true,
            priceOverride: true,
            barcode: true,
            isActive: true,
            updatedAt: true,
          },
        }),
        prisma.customer.findMany({
          where: { companyId, ...(touched && { updatedAt: touched }) },
          select: {
            id: true,
            name: true,
            taxId: true,
            taxCondition: true,
            saleCondition: true,
            address: true,
            city: true,
            province: true,
            postalCode: true,
            phone: true,
            email: true,
            isActive: true,
            updatedAt: true,
          },
        }),
        // Stock SÍ tiene updatedAt (el comentario de SyncController que dice lo
        // contrario está desactualizado), así que el delta también aplica acá.
        prisma.stock.findMany({
          where: { warehouse: { companyId }, ...(touched && { updatedAt: touched }) },
          select: {
            id: true,
            productId: true,
            variantId: true,
            warehouseId: true,
            quantity: true,
            reservedQuantity: true,
            minQuantity: true,
            updatedAt: true,
          },
        }),
        prisma.warehouse.findMany({
          where: { companyId, ...(touched && { updatedAt: touched }) },
          select: {
            id: true,
            name: true,
            isDefault: true,
            isActive: true,
            updatedAt: true,
          },
        }),
        // Cabecera de comprobantes: una fila cada uno, siempre completas.
        prisma.company.findUnique({ where: { id: companyId } }),
        prisma.afipConfig.findFirst({ where: { companyId } }),
        prisma.appSettings.findFirst(),
        this.buildCounts(companyId),
      ]);

      res.json({
        status: 'ok',
        syncedAt,
        since: since?.toISOString() ?? null,
        full: !since,
        data: {
          products,
          productVariants,
          customers,
          stocks,
          warehouses,
          company,
          afipConfig,
          appSettings,
        },
        counts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Totales reales por tabla. El cliente los usa para detectar que se borró
   * algo y forzar una recarga completa.
   */
  private async buildCounts(companyId: string) {
    const [products, productVariants, customers, stocks, warehouses] = await Promise.all([
      prisma.product.count({ where: { companyId } }),
      prisma.productVariant.count({ where: { companyId } }),
      prisma.customer.count({ where: { companyId } }),
      prisma.stock.count({ where: { warehouse: { companyId } } }),
      prisma.warehouse.count({ where: { companyId } }),
    ]);
    return { products, productVariants, customers, stocks, warehouses };
  }
}
