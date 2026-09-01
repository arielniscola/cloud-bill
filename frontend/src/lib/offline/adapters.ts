import type { AppSettings, Customer, Product, TaxCondition, Warehouse } from '../../types';
import {
  availableQty,
  getSingletonLocal,
  getStockLocal,
  getWarehousesLocal,
  searchCustomersLocal,
  searchProductsLocal,
} from './catalogCache';
import type { CachedCustomer, CachedProduct } from './db';

/**
 * Traduce lo guardado en IndexedDB a los tipos que ya usan los componentes,
 * asi el resto de la app no se entera de si los datos vinieron de la red o de
 * la cache.
 *
 * Los campos que la cache no guarda (description, cost, internalNotes,
 * relaciones) se completan con valores neutros: no hacen falta para vender y
 * no vale la pena engordar el snapshot con ellos.
 */

export function toProduct(c: CachedProduct): Product {
  return {
    id: c.id,
    sku: c.sku,
    name: c.name,
    description: null,
    rubroId: c.rubroId,
    brandId: c.brandId,
    categoryId: c.categoryId,
    supplierId: null,
    barcode: c.barcode,
    unit: c.unit,
    internalNotes: null,
    cost: 0,
    price: Number(c.price),
    salePriceUSD: c.salePriceUSD === null ? null : Number(c.salePriceUSD),
    taxRate: Number(c.taxRate),
    trackStock: c.trackStock,
    priceUpdatedAt: c.priceUpdatedAt,
    isActive: c.isActive,
    createdAt: c.updatedAt,
    updatedAt: c.updatedAt,
  };
}

export function toCustomer(c: CachedCustomer): Customer {
  return {
    id: c.id,
    name: c.name,
    taxId: c.taxId,
    taxCondition: c.taxCondition as TaxCondition,
    saleCondition: c.saleCondition,
    address: c.address,
    city: c.city,
    province: c.province,
    postalCode: c.postalCode,
    phone: c.phone,
    email: c.email,
    notes: null,
    isActive: c.isActive,
    createdAt: c.updatedAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Busqueda de productos contra la cache, con el stock agregado ya resuelto
 * (misma forma que devuelve GET /products).
 */
export async function searchProductsOffline(
  query: string,
  limit = 50
): Promise<Product[]> {
  const rows = await searchProductsLocal(query, limit);
  return Promise.all(
    rows.map(async (row) => {
      const product = toProduct(row);
      if (!row.trackStock) return product;
      const stocks = await getStockLocal(row.id);
      if (stocks.length === 0) return product;
      product.stockQuantity = stocks.reduce((acc, s) => acc + Number(s.quantity), 0);
      product.stockReserved = stocks.reduce(
        (acc, s) => acc + Number(s.reservedQuantity),
        0
      );
      return product;
    })
  );
}

export async function searchCustomersOffline(
  query: string,
  limit = 50
): Promise<Customer[]> {
  return (await searchCustomersLocal(query, limit)).map(toCustomer);
}

/**
 * Depositos cacheados. El formulario de venta los necesita si o si: sin
 * deposito resuelto, la validacion de stock bloquea la venta.
 */
export async function getWarehousesOffline(): Promise<Warehouse[]> {
  const rows = await getWarehousesLocal();
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    address: null,
    isDefault: w.isDefault,
    isActive: w.isActive,
    createdAt: w.updatedAt,
    updatedAt: w.updatedAt,
  }));
}

/** Config global cacheada (avisos de precio viejo, etc.). */
export async function getAppSettingsOffline(): Promise<AppSettings | null> {
  return getSingletonLocal<AppSettings>('appSettings');
}

/** Cabecera de la empresa para los tickets, cuando no hay red. */
export async function getCompanyOffline<T>(): Promise<T | null> {
  return getSingletonLocal<T>('company');
}

/** Disponible (quantity - reserved) de un producto en un deposito. */
export async function availableOffline(
  productId: string,
  warehouseId?: string
): Promise<number> {
  const stocks = await getStockLocal(productId, warehouseId);
  return stocks.reduce((acc, s) => acc + availableQty(s), 0);
}
