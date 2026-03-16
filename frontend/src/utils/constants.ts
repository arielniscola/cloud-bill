export const TAX_CONDITIONS = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTISTA: 'Monotributista',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
} as const;

export const TAX_CONDITION_OPTIONS = Object.entries(TAX_CONDITIONS).map(
  ([value, label]) => ({ value, label })
);

export const INVOICE_TYPES = {
  FACTURA_A: 'Factura A',
  FACTURA_B: 'Factura B',
  FACTURA_C: 'Factura C',
  NOTA_CREDITO_A: 'Nota de Crédito A',
  NOTA_CREDITO_B: 'Nota de Crédito B',
  NOTA_CREDITO_C: 'Nota de Crédito C',
  NOTA_DEBITO_A: 'Nota de Débito A',
  NOTA_DEBITO_B: 'Nota de Débito B',
  NOTA_DEBITO_C: 'Nota de Débito C',
} as const;

export const INVOICE_TYPE_OPTIONS = Object.entries(INVOICE_TYPES).map(
  ([value, label]) => ({ value, label })
);

export const INVOICE_STATUSES = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
  PARTIALLY_PAID: 'Parcialmente Pagada',
} as const;

export const INVOICE_STATUS_OPTIONS = Object.entries(INVOICE_STATUSES).map(
  ([value, label]) => ({ value, label })
);

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
};

export const STOCK_MOVEMENT_TYPES = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT_IN: 'Ajuste Entrada',
  ADJUSTMENT_OUT: 'Ajuste Salida',
  TRANSFER_IN: 'Transferencia Entrada',
  TRANSFER_OUT: 'Transferencia Salida',
  RETURN: 'Devolución',
} as const;

export const STOCK_MOVEMENT_OPTIONS = Object.entries(STOCK_MOVEMENT_TYPES).map(
  ([value, label]) => ({ value, label })
);

export const USER_ROLES = {
  ADMIN: 'Administrador',
  SELLER: 'Vendedor',
  WAREHOUSE_CLERK: 'Empleado de Almacén',
} as const;

export const CURRENCIES = {
  ARS: 'Peso Argentino',
  USD: 'Dólar Estadounidense',
} as const;

export const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(
  ([value, label]) => ({ value, label })
);

export const REMITO_STATUSES = {
  PENDING: 'Pendiente',
  PARTIALLY_DELIVERED: 'Parcialmente Entregado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
} as const;

export const REMITO_STATUS_OPTIONS = Object.entries(REMITO_STATUSES).map(
  ([value, label]) => ({ value, label })
);

export const REMITO_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIALLY_DELIVERED: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export const STOCK_BEHAVIOR_OPTIONS = [
  { value: 'DISCOUNT', label: 'Descontar stock (entrega directa)' },
  { value: 'RESERVE', label: 'Reservar stock (retiro posterior)' },
];

export const BUDGET_STATUSES = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  CONVERTED: 'Convertido',
  EXPIRED: 'Vencido',
} as const;

export const BUDGET_STATUS_OPTIONS = Object.entries(BUDGET_STATUSES).map(
  ([value, label]) => ({ value, label })
);

export const BUDGET_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SENT: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CONVERTED: 'bg-purple-100 text-purple-800',
  EXPIRED: 'bg-orange-100 text-orange-800',
};

export const ORDEN_PEDIDO_STATUSES = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
  CONVERTED: 'Convertida',
} as const;

export const ORDEN_PEDIDO_STATUS_OPTIONS = Object.entries(ORDEN_PEDIDO_STATUSES).map(
  ([value, label]) => ({ value, label })
);

export const ORDEN_PEDIDO_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  CONVERTED: 'bg-purple-100 text-purple-800',
};

export const PAYMENT_METHODS = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia bancaria',
  MERCADO_PAGO: 'Mercado Pago',
  CHECK: 'Cheque',
  CARD: 'Tarjeta',
} as const;

/** AFIP: ventas en efectivo > este monto requieren identificar al cliente */
export const CASH_ID_THRESHOLD = 30767;

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHODS).map(
  ([value, label]) => ({ value, label })
);

export const RECIBO_STATUSES = {
  EMITTED: 'Emitido',
  CANCELLED: 'Cancelado',
} as const;

export const CHECK_STATUSES = {
  PENDING: 'En cartera',
  DEPOSITED: 'Depositado',
  CLEARED: 'Acreditado',
  BOUNCED: 'Rechazado',
  RETURNED: 'Devuelto',
} as const;

export const CHECK_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  DEPOSITED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  CLEARED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  BOUNCED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  RETURNED: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
};

export const CHECK_STATUS_OPTIONS = Object.entries(CHECK_STATUSES).map(([value, label]) => ({ value, label }));

export const RECIBO_STATUS_OPTIONS = Object.entries(RECIBO_STATUSES).map(
  ([value, label]) => ({ value, label })
);

export const SALE_CONDITIONS = {
  CONTADO: 'Contado',
  CUENTA_CORRIENTE: 'Cuenta Corriente',
} as const;

export const SALE_CONDITION_OPTIONS = Object.entries(SALE_CONDITIONS).map(
  ([value, label]) => ({ value, label })
);

export const PAYMENT_TERMS_OPTIONS = [
  { value: '', label: 'Sin especificar' },
  { value: 'Contado', label: 'Contado' },
  { value: '15 días', label: '15 días' },
  { value: '30 días', label: '30 días' },
  { value: '45 días', label: '45 días' },
  { value: '60 días', label: '60 días' },
  { value: '90 días', label: '90 días' },
  { value: '120 días', label: '120 días' },
  { value: 'Contra entrega', label: 'Contra entrega' },
  { value: 'A convenir', label: 'A convenir' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta Corriente' },
];

/** Términos que implican pago diferido → generan movimiento en cuenta corriente */
export const DEFERRED_PAYMENT_DAYS: Record<string, number> = {
  '15 días': 15,
  '30 días': 30,
  '45 días': 45,
  '60 días': 60,
  '90 días': 90,
  '120 días': 120,
};

export const DELIVERY_STATUSES = {
  NOT_DELIVERED: 'Sin entregar',
  PARTIALLY_DELIVERED: 'Entrega parcial',
  DELIVERED: 'Entregado',
} as const;

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
