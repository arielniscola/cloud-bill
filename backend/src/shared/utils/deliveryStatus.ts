import prisma from '../../infrastructure/database/prisma';

export type DeliveryStatus = 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED';

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
