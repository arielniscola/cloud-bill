import prisma from '../../infrastructure/database/prisma';

export const CONSUMIDOR_FINAL_NAME = 'Consumidor Final';

/**
 * Cliente genérico "Consumidor Final" de la empresa. Se usa cuando una venta
 * (factura u orden de pedido que se factura/cobra) no tiene cliente elegido:
 * `invoices.customerId` y `recibos.customerId` son obligatorios, así que la
 * venta anónima se imputa a este cliente en vez de volver nullable la columna.
 *
 * Se identifica por nombre + condición CONSUMIDOR_FINAL + sin CUIT. Si no
 * existe se crea; el advisory lock evita duplicarlo con dos ventas simultáneas.
 */
export async function resolveConsumidorFinalCustomerId(companyId: string): Promise<string> {
  const where = {
    companyId,
    name: CONSUMIDOR_FINAL_NAME,
    taxCondition: 'CONSUMIDOR_FINAL' as const,
    taxId: null,
  };

  const existing = await prisma.customer.findFirst({ where, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing.id;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consumidor_final:${companyId}`})::bigint)`;
    const again = await tx.customer.findFirst({ where, select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (again) return again.id;
    const created = await tx.customer.create({
      data: { ...where, saleCondition: 'CONTADO' },
      select: { id: true },
    });
    return created.id;
  });
}
