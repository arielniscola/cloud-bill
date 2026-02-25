import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IInvoiceRepository } from '../../../domain/repositories/IInvoiceRepository';
import { IPurchaseRepository } from '../../../domain/repositories/IPurchaseRepository';

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
        { dateFrom, dateTo }
      );

      const rows = result.data
        .filter((inv: any) => inv.status !== 'CANCELLED')
        .map((inv: any) => ({
          fecha: inv.date,
          numero: inv.number,
          afipCbtNum: inv.afipCbtNum ?? '',
          tipo: inv.type,
          cliente: inv.customer?.name ?? '',
          cuitCliente: inv.customer?.taxId ?? '',
          condicionIva: inv.customer?.taxCondition ?? '',
          neto: Number(inv.subtotal),
          iva: Number(inv.taxAmount),
          total: Number(inv.total),
          cae: inv.cae ?? '',
        }));

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
        { dateFrom, dateTo }
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
      const purchaseRepo = container.resolve<IPurchaseRepository>('PurchaseRepository');
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      const purchases = await purchaseRepo.findAllByPeriod(year, month);

      const rows = purchases.map((p) => ({
        fecha: p.date,
        numero: p.number,
        tipo: p.type,
        proveedor: p.supplier?.name ?? '',
        cuitProveedor: p.supplier?.cuit ?? '',
        neto: Number(p.subtotal),
        iva: Number(p.taxAmount),
        total: Number(p.total),
      }));

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

      const purchases = await purchaseRepo.findAllByPeriod(year, month);

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
