import { Decimal } from '@prisma/client/runtime/library';
import { ProductCustomFieldValue } from './ProductCustomField';

export interface Product {
  id: string;
  sku: string;
  name: string;
  companyId?: string | null;
  description: string | null;
  rubroId: string | null;
  brandId: string | null;
  categoryId: string | null;
  supplierId: string | null;
  barcode: string | null;
  unit: string | null;
  internalNotes: string | null;
  cost: Decimal;
  /** Costo en USD: si está, `cost` se deriva de él con la cotización (`costUsdRate`). */
  costUSD?: Decimal | null;
  costUsdRate?: Decimal | null;
  price: Decimal;
  salePriceUSD?: Decimal | null;
  taxRate: Decimal;
  leadTimeDays?: number | null;
  /** URL pública de la imagen — módulo "imagenes". */
  imageUrl?: string | null;
  /** Key del objeto en el bucket, para poder borrarlo al reemplazar/eliminar. */
  imageKey?: string | null;
  trackStock?: boolean;
  /** Stock por lote + vencimiento (solo si trackStock). */
  trackLots?: boolean;
  priceUpdatedAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  customFieldValues?: ProductCustomFieldValue[];
}

/** Origen de un cambio de precio/costo (ver product_price_history). */
export type PriceChangeSource =
  | 'CREATE' | 'MANUAL' | 'BULK' | 'IMPORT' | 'USD_RECALC' | 'PRICE_LIST_RATE' | 'PURCHASE_INVOICE' | 'REVERT' | 'OTHER';

/**
 * Quién y por qué cambia el precio. Se estampa en la misma sentencia que el
 * cambio y el trigger de products lo copia al historial. `ref` agrupa una
 * operación (masiva, importación, factura de compra) para poder deshacerla.
 */
export interface PriceContext {
  source: PriceChangeSource;
  userId?: string | null;
  ref?: string | null;
}

export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { priceContext?: PriceContext };
export type UpdateProductInput = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> & { priceContext?: PriceContext };
