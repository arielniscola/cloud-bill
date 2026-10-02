import type { PaymentMethod } from '../../types';

/**
 * Tipos y helpers del layout "mostrador" de la factura. Viven aparte del
 * componente para que InvoiceFormPage los use sin romper el fast refresh.
 */

export interface CounterItem {
  productId: string;
  variantId?: string | null;
  quantity: number | string;
  unitPrice: number | string;
  discountPct: number | string;
  taxRate: number | string;
}

/** Medio elegido en el panel. `CC` = venta a cuenta corriente (sin cobro). */
export type CounterTender = PaymentMethod | 'CC';

export interface CounterPayment {
  method: PaymentMethod;
  cashRegisterId: string;
  bankAccountId: string;
  reference: string;
  /** Lo que entregó el cliente en efectivo; solo sirve para calcular el vuelto. */
  received: string;
}

/** Medios que se cobran desde el panel. Tarjeta y cheque abren el modal de cobro (cuotas, recargo, datos del cheque). */
export const COUNTER_INLINE_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'MERCADO_PAGO'];

export interface CounterLastSale {
  id: string;
  label: string;
  total: number;
  change: number;
  paid: boolean;
}

/** Monto tipeado a mano: acepta "50.000,50" y "50000.50". */
export const parseAmount = (raw: string) => {
  const clean = raw.replace(/\s|\$/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
