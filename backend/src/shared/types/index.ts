export type UserRole = 'ADMIN' | 'SELLER' | 'WAREHOUSE_CLERK';

export type TaxCondition =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTISTA'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL';

export type InvoiceType =
  | 'FACTURA_A'
  | 'FACTURA_B'
  | 'FACTURA_C'
  | 'NOTA_CREDITO_A'
  | 'NOTA_CREDITO_B'
  | 'NOTA_CREDITO_C'
  | 'NOTA_DEBITO_A'
  | 'NOTA_DEBITO_B'
  | 'NOTA_DEBITO_C';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED' | 'PARTIALLY_PAID';

export type MovementType = 'DEBIT' | 'CREDIT';

export type StockMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}
