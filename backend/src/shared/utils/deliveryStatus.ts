import prisma from '../../infrastructure/database/prisma';

export type DeliveryStatus = 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED';

/**
 * Batch version of computeDeliveryStatus for list endpoints.
 * Runs only 2 DB queries regardless of list size.
 */
export async function computeDeliveryStatusBatch(
  sourceField: 'invoiceId' | 'budgetId',
  sourceIds: string[]
): Promise<Record<string, DeliveryStatus>> {
  if (sourceIds.length === 0) return {};

  // For invoices, also fetch ordenPedidoId to include OP-linked remitos
  const ordenPedidoByInvoice: Record<string, string> = {};
  if (sourceField === 'invoiceId') {
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: sourceIds } } as any,
      select: { id: true, ordenPedidoId: true } as any,
    });
    for (const inv of invoices as any[]) {
      if (inv.ordenPedidoId) ordenPedidoByInvoice[inv.id] = inv.ordenPedidoId;
    }
  }

  const opIds = Object.values(ordenPedidoByInvoice);

  const [sourceItemRows, remitoItemRows, opRemitoItemRows] = await Promise.all([
    sourceField === 'invoiceId'
      ? prisma.invoiceItem.findMany({
          where: { invoiceId: { in: sourceIds } },
          select: { invoiceId: true, productId: true, quantity: true },
        })
      : prisma.budgetItem.findMany({
          where: { budgetId: { in: sourceIds }, productId: { not: null } },
          select: { budgetId: true, productId: true, quantity: true },
        }),
    prisma.remitoItem.findMany({
      where: {
        remito: { [sourceField]: { in: sourceIds }, status: { not: 'CANCELLED' } },
      },
      select: {
        productId: true,
        deliveredQuantity: true,
        remito: { select: { invoiceId: true, budgetId: true } },
      },
    }),
    opIds.length > 0
      ? prisma.remitoItem.findMany({
          where: {
            remito: { ordenPedidoId: { in: opIds }, status: { not: 'CANCELLED' } } as any,
          },
          select: {
            productId: true,
            deliveredQuantity: true,
            remito: { select: { ordenPedidoId: true } } as any,
          },
        })
      : Promise.resolve([]),
  ]);

  // Group source items by sourceId
  const itemsBySource: Record<string, { productId: string; quantity: number }[]> = {};
  for (const row of sourceItemRows) {
    const sid = (row as any)[sourceField] as string;
    if (!itemsBySource[sid]) itemsBySource[sid] = [];
    itemsBySource[sid].push({ productId: row.productId as string, quantity: Number(row.quantity) });
  }

  // Build reverse map: ordenPedidoId → invoiceId
  const invoiceByOp: Record<string, string> = {};
  for (const [invId, opId] of Object.entries(ordenPedidoByInvoice)) {
    invoiceByOp[opId] = invId;
  }

  // Group delivered quantities by sourceId + productId
  const deliveredBySource: Record<string, Record<string, number>> = {};
  for (const ri of remitoItemRows) {
    const sid = (ri.remito as any)[sourceField] as string;
    if (!sid) continue;
    if (!deliveredBySource[sid]) deliveredBySource[sid] = {};
    deliveredBySource[sid][ri.productId] =
      (deliveredBySource[sid][ri.productId] || 0) + Number(ri.deliveredQuantity);
  }
  // Merge OP remito items into their corresponding invoice
  for (const ri of opRemitoItemRows as any[]) {
    const opId = ri.remito?.ordenPedidoId as string;
    const sid = invoiceByOp[opId];
    if (!sid) continue;
    if (!deliveredBySource[sid]) deliveredBySource[sid] = {};
    deliveredBySource[sid][ri.productId] =
      (deliveredBySource[sid][ri.productId] || 0) + Number(ri.deliveredQuantity);
  }

  // Compute status for each id
  const result: Record<string, DeliveryStatus> = {};
  for (const sid of sourceIds) {
    const items = itemsBySource[sid] ?? [];
    if (items.length === 0) {
      result[sid] = 'NOT_DELIVERED';
      continue;
    }
    const delivered = deliveredBySource[sid] ?? {};
    let allDelivered = true;
    let anyDelivered = false;
    for (const item of items) {
      const qty = delivered[item.productId] ?? 0;
      if (qty >= item.quantity) {
        anyDelivered = true;
      } else {
        allDelivered = false;
        if (qty > 0) anyDelivered = true;
      }
    }
    result[sid] = allDelivered ? 'DELIVERED' : anyDelivered ? 'PARTIALLY_DELIVERED' : 'NOT_DELIVERED';
  }
  return result;
}

/**
 * Computes the delivery status for an invoice or budget by inspecting
 * all non-cancelled remitos linked to it.
 *
 * - DELIVERED: every deliverable item's required quantity has been met
 * - PARTIALLY_DELIVERED: at least one item has been partially delivered
 * - NOT_DELIVERED: no deliveries recorded yet
 */
export async function computeDeliveryStatus(
  sourceField: 'invoiceId' | 'budgetId',
  sourceId: string,
  sourceItems: { productId: string | null; quantity: any }[]
): Promise<DeliveryStatus> {
  // Only items with a linked product can be delivered via remito
  const deliverableItems = sourceItems.filter((i) => !!i.productId);
  if (deliverableItems.length === 0) return 'NOT_DELIVERED';

  // For invoices converted from an OP, also check remitos linked to that OP
  let ordenPedidoId: string | null = null;
  if (sourceField === 'invoiceId') {
    const invoice = await prisma.invoice.findUnique({
      where: { id: sourceId },
      select: { ordenPedidoId: true } as any,
    });
    ordenPedidoId = (invoice as any)?.ordenPedidoId ?? null;
  }

  // Aggregate deliveredQuantity from all non-cancelled remito items
  // (linked directly to the invoice/budget OR to the originating OP)
  const whereConditions: any[] = [
    { [sourceField]: sourceId, status: { not: 'CANCELLED' } },
  ];
  if (ordenPedidoId) {
    whereConditions.push({ ordenPedidoId, status: { not: 'CANCELLED' } });
  }

  const remitoItems = await prisma.remitoItem.findMany({
    where: {
      remito: { OR: whereConditions },
    },
    select: { productId: true, deliveredQuantity: true },
  });

  const deliveredMap: Record<string, number> = {};
  for (const item of remitoItems) {
    deliveredMap[item.productId] = (deliveredMap[item.productId] || 0) + Number(item.deliveredQuantity);
  }

  let allDelivered = true;
  let anyDelivered = false;

  for (const item of deliverableItems) {
    const pid = item.productId as string;
    const delivered = deliveredMap[pid] || 0;
    const required = Number(item.quantity);

    if (delivered >= required) {
      anyDelivered = true;
    } else {
      allDelivered = false;
      if (delivered > 0) anyDelivered = true;
    }
  }

  if (allDelivered) return 'DELIVERED';
  if (anyDelivered) return 'PARTIALLY_DELIVERED';
  return 'NOT_DELIVERED';
}
