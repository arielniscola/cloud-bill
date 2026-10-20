import { useEffect, useState } from 'react';
import { stockService } from '../services';
import type { DocumentLot } from '../types';

/** Lotes que entregaron estos comprobantes (los movimientos de stock reales), para el detalle y la impresión. */
export function useDocumentLots(ids: (string | null | undefined)[]): DocumentLot[] {
  const clean = ids.filter((x): x is string => !!x);
  const key = clean.join(',');
  const [lots, setLots] = useState<DocumentLot[]>([]);

  useEffect(() => {
    if (!key) { setLots([]); return; }
    let cancelled = false;
    stockService
      .getLotsByReference(key.split(','))
      .then((data) => { if (!cancelled) setLots(data); })
      .catch(() => { if (!cancelled) setLots([]); });
    return () => { cancelled = true; };
  }, [key]);

  return lots;
}

export function lotsFor(lots: DocumentLot[], productId: string | null | undefined, variantId?: string | null): DocumentLot[] {
  if (!productId) return [];
  return lots.filter((l) => l.productId === productId && (l.variantId ?? null) === (variantId ?? null));
}
