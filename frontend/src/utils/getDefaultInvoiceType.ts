export function getDefaultInvoiceType(
  customerTaxCondition: string | null | undefined,
  companyTaxCondition: string
): 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' {
  if (companyTaxCondition === 'MONOTRIBUTISTA') return 'FACTURA_C';
  if (companyTaxCondition === 'EXENTO') return 'FACTURA_B';
  // empresa RI
  if (customerTaxCondition === 'RESPONSABLE_INSCRIPTO') return 'FACTURA_A';
  return 'FACTURA_B';
}
