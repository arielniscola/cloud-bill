/** Documento válido para identificar al comprador: DNI (7-8 dígitos) o CUIL (11). */
export function buyerDocumentError(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return [7, 8, 11].includes(digits.length) ? null : 'Ingresá un DNI (7 u 8 dígitos) o un CUIL (11 dígitos)';
}
