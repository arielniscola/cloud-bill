/**
 * Una "condición de venta a X días" (ej: "30 días", "60 dias") implica pago
 * diferido → debe generar movimiento en la cuenta corriente igual que CUENTA_CORRIENTE.
 */
export function isDeferredPaymentTerm(term?: string | null): boolean {
  if (!term) return false;
  return /\d+\s*d[ií]as/i.test(term);
}

/**
 * Condición de cobro efectiva: si la condición es a X días, se trata como
 * CUENTA_CORRIENTE para los movimientos de cuenta corriente.
 */
export function effectiveSaleCondition(saleCondition?: string | null, paymentTerms?: string | null): string {
  if (saleCondition === 'CUENTA_CORRIENTE') return 'CUENTA_CORRIENTE';
  if (isDeferredPaymentTerm(paymentTerms)) return 'CUENTA_CORRIENTE';
  return saleCondition ?? 'CONTADO';
}
