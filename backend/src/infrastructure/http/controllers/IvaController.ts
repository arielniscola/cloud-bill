import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IPurchaseRepository } from '../../../domain/repositories/IPurchaseRepository';
import prisma from '../../database/prisma';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSVRow(values: unknown[]): string {
  return values.map(escapeCSV).join(',');
}

export class IvaController {
  async getVentas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      const dateFrom = new Date(year, month - 1, 1);
      const dateTo = new Date(year, month, 0, 23, 59, 59, 999);

      const result = await invoiceRepo.findAll(
        { page: 1, limit: 9999 },
        { dateFrom, dateTo, companyId: (req as any).companyId, fiscalMode: 'FORMAL' }
      );

      const filtered = result.data.filter((inv: any) => inv.status !== 'CANCELLED');

      // Fetch items for all invoices in a single query
      const invoiceIds = filtered.map((inv: any) => inv.id);
      let itemsMap = new Map<string, any[]>();
      if (invoiceIds.length > 0) {
        const allItems = await prisma.$queryRaw<any[]>`
          SELECT ii."invoiceId", COALESCE(p.name, '') AS description,
            ii.quantity, ii."unitPrice", ii."taxRate", ii.subtotal, ii.total,
            COALESCE(r.name, '') AS "superRubro"
          FROM "invoice_items" ii
          LEFT JOIN "products" p ON p.id = ii."productId"
          LEFT JOIN "rubros" r ON r.id = p."rubroId"
          WHERE ii."invoiceId" IN (${Prisma.join(invoiceIds)})
          ORDER BY ii."invoiceId"
        `;
        for (const it of allItems) {
          const list = itemsMap.get(it.invoiceId) ?? [];
          list.push({
            description: it.description ?? '',
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            taxRate: Number(it.taxRate ?? 21),
            subtotal: Number(it.subtotal),
            total: Number(it.total),
            superRubro: it.superRubro ?? '',
          });
          itemsMap.set(it.invoiceId, list);
        }
      }

      const rows = filtered.map((inv: any) => {
        const sign = String(inv.type).startsWith('NOTA_CREDITO') ? -1 : 1;
        const its = itemsMap.get(inv.id) ?? [];

        // Neto gravado / exento / alícuotas a partir de los ítems
        let neto = 0, exento = 0;
        const alicMap = new Map<number, { neto: number; iva: number }>();
        if (its.length > 0) {
          for (const it of its) {
            const rate = Number(it.taxRate ?? 0);
            const sub = Number(it.subtotal ?? 0);
            if (rate > 0) {
              neto += sub;
              const a = alicMap.get(rate) ?? { neto: 0, iva: 0 };
              a.neto += sub;
              a.iva += sub * (rate / 100);
              alicMap.set(rate, a);
            } else {
              exento += sub;
            }
          }
        } else {
          neto = Number(inv.subtotal);
          if (Number(inv.taxAmount) > 0) alicMap.set(21, { neto, iva: Number(inv.taxAmount) });
        }
        const alicuotas = Array.from(alicMap.entries())
          .map(([rate, v]) => ({ rate, neto: v.neto * sign, iva: v.iva * sign }))
          .sort((a, b) => a.rate - b.rate);

        return {
          invoiceId: inv.id,
          fecha: inv.date,
          numero: inv.number,
          afipCbtNum: inv.afipCbtNum ?? '',
          tipo: inv.type,
          cliente: inv.customer?.name ?? '',
          cuitCliente: inv.customer?.taxId ?? '',
          condicionIva: inv.customer?.taxCondition ?? '',
          neto: (its.length > 0 ? neto : Number(inv.subtotal)) * sign,
          exento: exento * sign,
          iva: Number(inv.taxAmount) * sign,
          total: Number(inv.total) * sign,
          cae: inv.cae ?? '',
          status: inv.status,
          saleCondition: (inv as any).saleCondition ?? 'CONTADO',
          paymentTerms: inv.paymentTerms ?? null,
          alicuotas,
          items: its.map((it: any) => ({ ...it, subtotal: it.subtotal * sign, total: it.total * sign })),
        };
      });

      res.json({ status: 'success', data: rows });
    } catch (error) {
      next(error);
    }
  }

  async exportVentasCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      const dateFrom = new Date(year, month - 1, 1);
      const dateTo = new Date(year, month, 0, 23, 59, 59, 999);

      const result = await invoiceRepo.findAll(
        { page: 1, limit: 9999 },
        { dateFrom, dateTo, companyId: (req as any).companyId, fiscalMode: 'FORMAL' }
      );

      const header = toCSVRow([
        'Fecha', 'Número', 'N° AFIP', 'Tipo', 'Cliente', 'CUIT', 'Condición IVA',
        'Neto Gravado', 'IVA', 'Total', 'CAE',
      ]);

      const lines = result.data
        .filter((inv: any) => inv.status !== 'CANCELLED')
        .map((inv: any) =>
          toCSVRow([
            new Date(inv.date).toLocaleDateString('es-AR'),
            inv.number,
            inv.afipCbtNum ?? '',
            inv.type,
            inv.customer?.name ?? '',
            inv.customer?.taxId ?? '',
            inv.customer?.taxCondition ?? '',
            Number(inv.subtotal).toFixed(2),
            Number(inv.taxAmount).toFixed(2),
            Number(inv.total).toFixed(2),
            inv.cae ?? '',
          ])
        );

      const csv = [header, ...lines].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=iva-ventas-${year}-${String(month).padStart(2, '0')}.csv`
      );
      res.send('\uFEFF' + csv);
    } catch (error) {
      next(error);
    }
  }

  async getCompras(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const companyId = (req as any).companyId;

      const dateFrom = new Date(year, month - 1, 1);
      const dateTo = new Date(year, month, 0, 23, 59, 59, 999);

      // Libro IVA Compras = facturas de proveedor (documento fiscal). Usamos la
      // fecha de imputación cuando existe, si no la fecha del comprobante.
      const invoices = await prisma.$queryRaw<any[]>`
        SELECT pi.id, pi.number, pi.type, pi.subtotal, pi."taxRate", pi."taxAmount", pi.amount,
               COALESCE(pi."imputationDate", pi.date) AS fecha,
               pi.status, pi."saleCondition",
               s.name AS "supplierName", s.cuit AS "supplierCuit"
        FROM "purchase_invoices" pi
        LEFT JOIN "suppliers" s ON s.id = pi."supplierId"
        WHERE pi."companyId" = ${companyId} AND pi."fiscalMode" = 'FORMAL'
          AND COALESCE(pi."imputationDate", pi.date) >= ${dateFrom}
          AND COALESCE(pi."imputationDate", pi.date) <= ${dateTo}
        ORDER BY COALESCE(pi."imputationDate", pi.date) ASC, pi.number ASC
      `;

      const ids = invoices.map((i) => i.id);
      const itemsByInv = new Map<string, any[]>();
      const tribByInv = new Map<string, any[]>();
      if (ids.length > 0) {
        const allItems = await prisma.$queryRaw<any[]>`
          SELECT "purchaseInvoiceId", description, quantity, "unitPrice", "taxRate", subtotal, "taxAmount", total
          FROM "purchase_invoice_items"
          WHERE "purchaseInvoiceId" IN (${Prisma.join(ids)})
          ORDER BY "createdAt" ASC
        `;
        for (const it of allItems) {
          const list = itemsByInv.get(it.purchaseInvoiceId) ?? [];
          list.push(it);
          itemsByInv.set(it.purchaseInvoiceId, list);
        }
        const allTrib = await prisma.$queryRaw<any[]>`
          SELECT "purchaseInvoiceId", type, amount
          FROM "purchase_invoice_tributos"
          WHERE "purchaseInvoiceId" IN (${Prisma.join(ids)})
        `;
        for (const tr of allTrib) {
          const list = tribByInv.get(tr.purchaseInvoiceId) ?? [];
          list.push(tr);
          tribByInv.set(tr.purchaseInvoiceId, list);
        }
      }

      const rows = invoices.map((inv) => {
        // Las NC restan en el libro IVA
        const sign = String(inv.type).startsWith('NOTA_CREDITO') ? -1 : 1;
        const its = itemsByInv.get(inv.id) ?? [];
        const trs = tribByInv.get(inv.id) ?? [];

        // Neto gravado vs exento (por alícuota del ítem; si no hay ítems, heurística por taxAmount)
        let neto = 0, exento = 0;
        const alicMap = new Map<number, { neto: number; iva: number }>();
        if (its.length > 0) {
          for (const it of its) {
            const rate = Number(it.taxRate ?? 0);
            const sub = Number(it.subtotal ?? 0);
            if (rate > 0) {
              neto += sub;
              const a = alicMap.get(rate) ?? { neto: 0, iva: 0 };
              a.neto += sub;
              a.iva += Number(it.taxAmount ?? 0);
              alicMap.set(rate, a);
            } else {
              exento += sub;
            }
          }
        } else if (Number(inv.taxAmount) > 0) {
          neto = Number(inv.subtotal);
          const rate = Number(inv.taxRate) || 21;
          alicMap.set(rate, { neto, iva: Number(inv.taxAmount) });
        } else {
          exento = Number(inv.subtotal);
        }

        let percepcionIva = 0, percepcionIIBB = 0, otrosTributos = 0;
        for (const tr of trs) {
          const amt = Number(tr.amount ?? 0);
          if (tr.type === 'PERCEPCION_IVA') percepcionIva += amt;
          else if (tr.type === 'PERCEPCION_IIBB') percepcionIIBB += amt;
          else otrosTributos += amt;
        }

        const alicuotas = Array.from(alicMap.entries())
          .map(([rate, v]) => ({ rate, neto: v.neto * sign, iva: v.iva * sign }))
          .sort((a, b) => a.rate - b.rate);

        return {
          purchaseId: inv.id,
          fecha: inv.fecha,
          numero: inv.number,
          tipo: inv.type,
          proveedor: inv.supplierName ?? '',
          cuitProveedor: inv.supplierCuit ?? '',
          neto: neto * sign,
          exento: exento * sign,
          iva: Number(inv.taxAmount) * sign,
          percepcionIva: percepcionIva * sign,
          percepcionIIBB: percepcionIIBB * sign,
          otrosTributos: otrosTributos * sign,
          total: Number(inv.amount) * sign,
          status: inv.status,
          paymentStatus: null,
          saleCondition: inv.saleCondition ?? 'CONTADO',
          alicuotas,
          items: its.map((it: any) => ({
            description: it.description ?? '',
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            taxRate: Number(it.taxRate ?? 21),
            subtotal: Number(it.subtotal) * sign,
            total: Number(it.total) * sign,
            superRubro: '',
          })),
        };
      });

      res.json({ status: 'success', data: rows });
    } catch (error) {
      next(error);
    }
  }

  async exportComprasCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchaseRepo = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      const purchases = await purchaseRepo.findAllByPeriod(year, month, (req as any).companyId, 'FORMAL');

      const header = toCSVRow([
        'Fecha', 'Número', 'Tipo', 'Proveedor', 'CUIT', 'Neto', 'IVA', 'Total',
      ]);

      const lines = purchases.map((p) =>
        toCSVRow([
          new Date(p.date).toLocaleDateString('es-AR'),
          p.number,
          p.type,
          p.supplier?.name ?? '',
          p.supplier?.cuit ?? '',
          Number(p.subtotal).toFixed(2),
          Number(p.taxAmount).toFixed(2),
          Number(p.total).toFixed(2),
        ])
      );

      const csv = [header, ...lines].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=iva-compras-${year}-${String(month).padStart(2, '0')}.csv`
      );
      res.send('\uFEFF' + csv);
    } catch (error) {
      next(error);
    }
  }
}
