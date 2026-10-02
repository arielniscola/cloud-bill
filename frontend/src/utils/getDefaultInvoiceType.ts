import type { DefaultInvoiceType } from '../types/app-settings.types';

type FacturaType = 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';

/**
 * Tipo de factura preseleccionado. Si la empresa fijó uno en Configuración
 * (`configured` distinto de 'AUTO') se usa ese; si no, se deduce de la
 * condición fiscal de la empresa y del cliente.
 */
export function getDefaultInvoiceType(
  customerTaxCondition: string | null | undefined,
  companyTaxCondition: string,
  configured?: DefaultInvoiceType | null
): FacturaType {
  if (configured && configured !== 'AUTO') return configured;
  if (companyTaxCondition === 'MONOTRIBUTISTA') return 'FACTURA_C';
  if (companyTaxCondition === 'EXENTO') return 'FACTURA_B';
  // empresa RI
  if (customerTaxCondition === 'RESPONSABLE_INSCRIPTO') return 'FACTURA_A';
  return 'FACTURA_B';
}

/** Venta sin cliente (Consumidor Final): Factura C salvo que se haya fijado otro tipo. */
export function getConsumidorFinalInvoiceType(configured?: DefaultInvoiceType | null): FacturaType {
  return configured && configured !== 'AUTO' ? configured : 'FACTURA_C';
}
