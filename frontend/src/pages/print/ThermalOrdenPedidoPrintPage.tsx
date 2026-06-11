import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ordenPedidosService, afipService } from '../../services';
import companiesService from '../../services/companies.service';
import { formatCuit } from '../../utils/formatters';
import type { OrdenPedido } from '../../types';
import type { AfipConfigSummary } from '../../types/afip.types';
import type { Company } from '../../types/company.types';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function ThermalOrdenPedidoPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [op, setOp] = useState<OrdenPedido | null>(null);
  const [afip, setAfip] = useState<AfipConfigSummary | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    // La OP es obligatoria; config AFIP y empresa son tolerantes a fallo
    // (p.ej. roles sin acceso a la config AFIP) para poder hacer fallback al header.
    Promise.all([
      ordenPedidosService.getById(id),
      afipService.getConfig().catch(() => null),
      companiesService.getCurrent().catch(() => null),
    ])
      .then(([data, cfg, comp]) => { setOp(data); setAfip(cfg); setCompany(comp); setReady(true); })
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

  // Encabezado de empresa: prioriza la config AFIP; si falta, cae a los datos de la empresa
  const issuer = {
    name:          afip?.businessName    || company?.name    || '',
    address:       afip?.businessAddress || company?.address  || '',
    cuit:          afip?.cuit            || company?.cuit     || '',
    activityStart: (afip as any)?.activityStartDate || '',
  };

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
      {issuer.name && <p className="c b lg">{issuer.name}</p>}
      {issuer.address && <p className="c sm">{issuer.address}</p>}
      {issuer.cuit && <p className="c sm">CUIT: {formatCuit(issuer.cuit)}</p>}
      {issuer.activityStart && (
        <p className="c sm">Inicio actividades: {fmtDate(issuer.activityStart)}</p>
      )}

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
          {op.customer.taxId && <p className="sm">CUIT/DNI: {formatCuit(op.customer.taxId)}</p>}
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
      {op.saleCondition && (
        <p className="sm">
          Cond. cobro: {op.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado'}
        </p>
      )}
      {op.paymentTerms && <p className="sm">Cond. venta: {op.paymentTerms}</p>}
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
