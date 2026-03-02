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

  const [sourceItemRows, remitoItemRows] = await Promise.all([
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
  ]);

  // Group source items by sourceId
  const itemsBySource: Record<string, { productId: string; quantity: number }[]> = {};
  for (const row of sourceItemRows) {
    const sid = (row as any)[sourceField] as string;
    if (!itemsBySource[sid]) itemsBySource[sid] = [];
    itemsBySource[sid].push({ productId: row.productId as string, quantity: Number(row.quantity) });
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

  // Aggregate deliveredQuantity from all non-cancelled remito items
  const remitoItems = await prisma.remitoItem.findMany({
    where: {
      remito: {
        [sourceField]: sourceId,
        status: { not: 'CANCELLED' },
      },
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
