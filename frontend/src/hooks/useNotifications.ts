import { useState, useEffect, useCallback } from 'react';
import { stockService, invoicesService, currentAccountsService } from '../services';
import { remindersService } from '../services/reminders.service';
import type { Stock, Invoice, CurrentAccount } from '../types';
import type { Reminder } from '../services/reminders.service';

export type NotificationType =
  | 'low-stock'
  | 'invoice'
  | 'account'
  | 'invoice-due'
  | 'check-due'
  | 'ordenpedido-due';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  href: string;
  urgency?: 'overdue' | 'critical' | 'warning';
  amount?: number;
}

function buildBaseNotifications(
  lowStock: Stock[],
  invoices: Invoice[],
  debtAccounts: CurrentAccount[]
): Notification[] {
  const notifications: Notification[] = [];

  for (const stock of lowStock) {
    notifications.push({
      id: `low-stock-${stock.id}`,
      type: 'low-stock',
      title: 'Stock bajo',
      message: `${stock.product?.name ?? stock.productId}: ${stock.quantity} unidades (mín. ${stock.minQuantity})`,
      href: '/stock',
    });
  }

  for (const invoice of invoices) {
    notifications.push({
      id: `invoice-${invoice.id}`,
      type: 'invoice',
      title: 'Factura emitida sin cobrar',
      message: `${invoice.number} – ${invoice.customer?.name ?? invoice.customerId}`,
      href: `/invoices/${invoice.id}`,
    });
  }

  for (const account of debtAccounts) {
    notifications.push({
      id: `account-${account.id}`,
      type: 'account',
      title: 'Deuda en cuenta corriente',
      message: `${account.customer?.name ?? account.customerId}: $${Number(account.balance).toFixed(2)} ${account.currency}`,
      href: `/current-accounts/${account.customerId}`,
    });
  }

  return notifications;
}

function reminderToNotification(r: Reminder): Notification {
  return {
    id: r.id,
    type: r.type as NotificationType,
    title: r.title,
    message: r.message,
    href: r.href,
    urgency: r.urgency,
    amount: r.amount,
  };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [lowStockResult, invoicesResult, debtAccountsResult, remindersResult] =
        await Promise.allSettled([
          stockService.getLowStock(),
          invoicesService.getAll({ status: 'ISSUED', limit: 50 }),
          currentAccountsService.getAllWithDebt(),
          remindersService.getReminders(7),
        ]);

      const lowStock = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
      const invoices =
        invoicesResult.status === 'fulfilled' ? invoicesResult.value.data : [];
      const debtAccounts =
        debtAccountsResult.status === 'fulfilled' ? debtAccountsResult.value : [];
      const reminders =
        remindersResult.status === 'fulfilled'
          ? remindersResult.value.reminders.map(reminderToNotification)
          : [];

      // Urgentes primero, luego el resto
      const urgent = reminders.filter(
        (r) => r.urgency === 'overdue' || r.urgency === 'critical'
      );
      const warning = reminders.filter((r) => r.urgency === 'warning');

      setNotifications([
        ...urgent,
        ...buildBaseNotifications(lowStock, invoices, debtAccounts),
        ...warning,
      ]);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return { notifications, loading, refetch: fetchNotifications };
}
