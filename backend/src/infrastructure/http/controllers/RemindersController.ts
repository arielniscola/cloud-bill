import { Request, Response, NextFunction } from 'express';
import prisma from '../../database/prisma';

type UrgencyLevel = 'overdue' | 'critical' | 'warning';

function classifyDueDate(dueDate: Date, now: Date): { urgency: UrgencyLevel; daysUntilDue: number } {
  const diffMs = dueDate.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 0) return { urgency: 'overdue', daysUntilDue };
  if (daysUntilDue <= 2) return { urgency: 'critical', daysUntilDue };
  return { urgency: 'warning', daysUntilDue };
}

function dueDateLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) return `Vencida hace ${Math.abs(daysUntilDue)} día${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`;
  if (daysUntilDue === 0) return 'Vence hoy';
  if (daysUntilDue === 1) return 'Vence mañana';
  return `Vence en ${daysUntilDue} días`;
}

export class RemindersController {
  async getReminders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId;
      const days = Math.min(parseInt(req.query.days as string) || 7, 90);

      const now = new Date();
      const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const companyFilter = companyId ? { companyId } : {};

      const [invoices, checks, ordenPedidos] = await Promise.all([
        // Facturas por cobrar con dueDate próximo o ya vencido
        prisma.invoice.findMany({
          where: {
            ...companyFilter,
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            dueDate: { not: null, lte: cutoff },
          },
          select: {
            id: true,
            number: true,
            dueDate: true,
            total: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
          orderBy: { dueDate: 'asc' },
        }),

        // Cheques recibidos por cobrar con checkDueDate próximo o vencido
        (prisma as any).recibo.findMany({
          where: {
            ...companyFilter,
            paymentMethod: 'CHECK',
            status: 'EMITTED',
            checkDueDate: { not: null, lte: cutoff },
          },
          select: {
            id: true,
            number: true,
            checkDueDate: true,
            amount: true,
            bank: true,
            reference: true,
            invoiceId: true,
            customer: { select: { id: true, name: true } },
          },
          orderBy: { checkDueDate: 'asc' },
        }),

        // Órdenes de Pedido con dueDate próximo o vencido
        (prisma as any).ordenPedido.findMany({
          where: {
            ...companyFilter,
            status: { notIn: ['CONVERTED', 'CANCELLED'] },
            dueDate: { not: null, lte: cutoff },
          },
          select: {
            id: true,
            number: true,
            dueDate: true,
            total: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
          orderBy: { dueDate: 'asc' },
        }),
      ]);

      const reminders: Array<{
        id: string;
        type: string;
        title: string;
        message: string;
        href: string;
        dueDate: Date;
        daysUntilDue: number;
        urgency: UrgencyLevel;
        amount: number;
      }> = [];

      for (const inv of invoices) {
        if (!inv.dueDate) continue;
        const { urgency, daysUntilDue } = classifyDueDate(new Date(inv.dueDate), now);
        reminders.push({
          id: `invoice-due-${inv.id}`,
          type: 'invoice-due',
          title: `Factura ${inv.number}`,
          message: `${inv.customer?.name ?? '—'} — ${dueDateLabel(daysUntilDue)}`,
          href: `/invoices/${inv.id}`,
          dueDate: inv.dueDate,
          daysUntilDue,
          urgency,
          amount: Number(inv.total),
        });
      }

      for (const rec of checks) {
        if (!rec.checkDueDate) continue;
        const { urgency, daysUntilDue } = classifyDueDate(new Date(rec.checkDueDate), now);
        const desc = rec.reference ? ` Nº ${rec.reference}` : '';
        reminders.push({
          id: `check-due-${rec.id}`,
          type: 'check-due',
          title: `Cheque${desc}${rec.bank ? ` — ${rec.bank}` : ''}`,
          message: `${rec.customer?.name ?? '—'} — ${dueDateLabel(daysUntilDue)}`,
          href: rec.invoiceId ? `/invoices/${rec.invoiceId}` : `/recibos/${rec.id}`,
          dueDate: rec.checkDueDate,
          daysUntilDue,
          urgency,
          amount: Number(rec.amount),
        });
      }

      for (const op of ordenPedidos) {
        if (!op.dueDate) continue;
        const { urgency, daysUntilDue } = classifyDueDate(new Date(op.dueDate), now);
        reminders.push({
          id: `op-due-${op.id}`,
          type: 'ordenpedido-due',
          title: `Orden ${op.number}`,
          message: `${op.customer?.name ?? '—'} — ${dueDateLabel(daysUntilDue)}`,
          href: `/orden-pedidos/${op.id}`,
          dueDate: op.dueDate,
          daysUntilDue,
          urgency,
          amount: Number(op.total),
        });
      }

      reminders.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

      const counts = {
        overdue: reminders.filter((r) => r.urgency === 'overdue').length,
        critical: reminders.filter((r) => r.urgency === 'critical').length,
        warning: reminders.filter((r) => r.urgency === 'warning').length,
        total: reminders.length,
      };

      res.json({ status: 'success', data: { reminders, counts } });
    } catch (error) {
      next(error);
    }
  }
}
