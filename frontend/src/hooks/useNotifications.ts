import { useState, useEffect, useCallback } from 'react';
import { stockService, invoicesService, currentAccountsService } from '../services';
import type { Stock, Invoice, CurrentAccount } from '../types';

export type NotificationType = 'low-stock' | 'invoice' | 'account';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  href: string;
}

function buildNotifications(
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

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [lowStockResult, invoicesResult, debtAccountsResult] = await Promise.allSettled([
        stockService.getLowStock(),
        invoicesService.getAll({ status: 'ISSUED', limit: 50 }),
        currentAccountsService.getAllWithDebt(),
      ]);

      const lowStock = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
      const invoices =
        invoicesResult.status === 'fulfilled' ? invoicesResult.value.data : [];
      const debtAccounts =
        debtAccountsResult.status === 'fulfilled' ? debtAccountsResult.value : [];

      setNotifications(buildNotifications(lowStock, invoices, debtAccounts));
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
