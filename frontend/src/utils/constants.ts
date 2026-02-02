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

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
