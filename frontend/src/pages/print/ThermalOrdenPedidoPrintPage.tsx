import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ordenPedidosService, afipService } from '../../services';
import type { OrdenPedido } from '../../types';
import type { AfipConfigSummary } from '../../types/afip.types';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function ThermalOrdenPedidoPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [op, setOp] = useState<OrdenPedido | null>(null);
  const [afip, setAfip] = useState<AfipConfigSummary | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([ordenPedidosService.getById(id), afipService.getConfig()])
      .then(([data, cfg]) => { setOp(data); setAfip(cfg); setReady(true); })
      .catch(() => { document.title = 'Error'; });
  }, [id]);

  useEffect(() => {
    if (!ready || !op) return;
    document.title = `Orden de Pedido ${op.number}`;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready, op]);

  if (!ready || !op) {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, padding: 8, width: 280 }}>
        Cargando...
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 3mm 4mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; width: 72mm; }
        @media screen { body { max-width: 320px; padding: 12px; background: #f5f5f5; } }
        @media print { body { background: #fff; } }
        .c  { text-align: center; }
        .r  { text-align: right; }
        .b  { font-weight: bold; }
        .lg { font-size: 13px; }
        .sm { font-size: 10px; }
        .div { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; }
        .item-desc { word-break: break-word; }
        .item-detail { display: flex; justify-content: space-between; padding-left: 8px; }
      `}</style>

      {/* ── Company header ── */}
      {afip?.businessName && <p className="c b lg">{afip.businessName}</p>}
      {afip?.businessAddress && <p className="c sm">{afip.businessAddress}</p>}
      {afip?.cuit && <p className="c sm">CUIT: {afip.cuit}</p>}

      <div className="div" />

      {/* ── Document header ── */}
      <p className="c b">NOTA DE PEDIDO</p>
      <p className="c">N° {op.number}</p>
      <p className="c sm">Fecha: {fmtDate(op.date ?? op.createdAt)}</p>
      {op.dueDate && <p className="c sm">Entrega: {fmtDate(op.dueDate)}</p>}

      {/* ── Customer ── */}
      {op.customer && (
        <>
          <div className="div" />
          <p className="b">Cliente:</p>
          <p>{op.customer.name}</p>
          {op.customer.taxId && <p className="sm">CUIT/DNI: {op.customer.taxId}</p>}
          {op.customer.address && <p className="sm">{op.customer.address}</p>}
        </>
      )}

      <div className="div" />

      {/* ── Items ── */}
      <div className="row sm b">
        <span>Descripción</span>
        <span>Total</span>
      </div>
      <div className="div" style={{ marginTop: 2, borderStyle: 'solid' }} />

      {(op.items ?? []).map((item, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <p className="item-desc">{item.description}</p>
          <div className="item-detail sm">
            <span>{Number(item.quantity)} x ${fmt(Number(item.unitPrice))}</span>
            <span>${fmt(Number(item.subtotal))}</span>
          </div>
        </div>
      ))}

      <div className="div" style={{ borderStyle: 'solid' }} />

      {/* ── Totals ── */}
      <div className="row">
        <span>Subtotal</span>
        <span>${fmt(Number(op.subtotal))}</span>
      </div>
      {Number(op.taxAmount) > 0 && (
        <div className="row">
          <span>IVA</span>
          <span>${fmt(Number(op.taxAmount))}</span>
        </div>
      )}
      <div className="div" />
      <div className="row b lg">
        <span>TOTAL</span>
        <span>{op.currency === 'USD' ? 'U$D' : '$'}{fmt(Number(op.total))}</span>
      </div>

      {/* ── Footer ── */}
      <div className="div" />
      {op.paymentTerms && <p className="sm">Condición: {op.paymentTerms}</p>}
      {op.notes && (
        <>
          <div className="div" />
          <p className="sm">{op.notes}</p>
        </>
      )}
      <div className="div" />
      <p className="c sm">Gracias por su compra</p>
    </>
  );
}
