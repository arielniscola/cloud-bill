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
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagado',
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
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
};

export const PAYMENT_METHODS = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia bancaria',
  CHECK: 'Cheque',
  CARD: 'Tarjeta',
} as const;

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHODS).map(
  ([value, label]) => ({ value, label })
);

export const RECIBO_STATUSES = {
  EMITTED: 'Emitido',
  CANCELLED: 'Cancelado',
} as const;

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
  { value: '60 días', label: '60 días' },
  { value: '90 días', label: '90 días' },
  { value: '120 días', label: '120 días' },
  { value: 'Contra entrega', label: 'Contra entrega' },
  { value: 'A convenir', label: 'A convenir' },
];

export const DELIVERY_STATUSES = {
  NOT_DELIVERED: 'Sin entregar',
  PARTIALLY_DELIVERED: 'Entrega parcial',
  DELIVERED: 'Entregado',
} as const;

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
