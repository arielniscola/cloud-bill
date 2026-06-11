import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { invoicesService, afipService } from '../../services';
import companiesService from '../../services/companies.service';
import { formatCuit } from '../../utils/formatters';
import type { Invoice } from '../../types';
import type { AfipConfigSummary } from '../../types/afip.types';
import type { Company } from '../../types/company.types';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const LINE = '─'.repeat(32);

export default function ThermalInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [afip, setAfip] = useState<AfipConfigSummary | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    // La factura es obligatoria; config AFIP y empresa son tolerantes a fallo
    // (p.ej. roles sin acceso a la config AFIP) para poder hacer fallback al header.
    Promise.all([
      invoicesService.getById(id),
      afipService.getConfig().catch(() => null),
      companiesService.getCurrent().catch(() => null),
    ])
      .then(([inv, cfg, comp]) => { setInvoice(inv); setAfip(cfg); setCompany(comp); setReady(true); })
      .catch(() => { document.title = 'Error'; });
  }, [id]);

  useEffect(() => {
    if (!ready || !invoice) return;
    document.title = `Factura ${invoice.number}`;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready, invoice]);

  if (!ready || !invoice) {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, padding: 8, width: 280 }}>
        Cargando...
      </div>
    );
  }

  const typeLabel = invoice.type?.replace('FACTURA_', 'FACTURA ') ?? invoice.type ?? '';

  // Encabezado de empresa: prioriza la config AFIP; si falta, cae a los datos de la empresa
  const issuer = {
    name:          afip?.businessName    || company?.name         || '',
    address:       afip?.businessAddress || company?.address       || '',
    cuit:          afip?.cuit            || company?.cuit          || '',
    taxCondition:  afip?.taxCondition    || company?.taxCondition  || '',
    activityStart: afip?.activityStartDate || '',
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
      {issuer.name && (
        <p className="c b lg">{issuer.name}</p>
      )}
      {issuer.address && (
        <p className="c sm">{issuer.address}</p>
      )}
      {issuer.cuit && (
        <p className="c sm">CUIT: {formatCuit(issuer.cuit)}</p>
      )}
      {issuer.taxCondition && (
        <p className="c sm">{issuer.taxCondition.replace(/_/g, ' ')}</p>
      )}
      {issuer.activityStart && (
        <p className="c sm">Inicio actividades: {fmtDate(issuer.activityStart)}</p>
      )}

      <div className="div" />

      {/* ── Document header ── */}
      <p className="c b">{typeLabel}</p>
      <p className="c">N° {invoice.number}</p>
      <p className="c sm">Fecha: {fmtDate(invoice.date ?? invoice.createdAt)}</p>

      {/* ── Customer ── */}
      {invoice.customer && (
        <>
          <div className="div" />
          <p className="b">Cliente:</p>
          <p>{invoice.customer.name}</p>
          {invoice.customer.taxId && <p className="sm">CUIT/DNI: {formatCuit(invoice.customer.taxId)}</p>}
          {invoice.customer.address && <p className="sm">{invoice.customer.address}</p>}
        </>
      )}

      <div className="div" />

      {/* ── Items ── */}
      <div className="row sm b">
        <span>Descripción</span>
        <span>Total</span>
      </div>
      <div className="div" style={{ marginTop: 2, borderStyle: 'solid' }} />

      {(invoice.items ?? []).map((item, i) => (
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
        <span>${fmt(Number(invoice.subtotal))}</span>
      </div>
      {Number(invoice.taxAmount) > 0 && (
        <div className="row">
          <span>IVA</span>
          <span>${fmt(Number(invoice.taxAmount))}</span>
        </div>
      )}
      <div className="div" />
      <div className="row b lg">
        <span>TOTAL</span>
        <span>{invoice.currency === 'USD' ? 'U$D' : '$'}{fmt(Number(invoice.total))}</span>
      </div>

      {/* ── Footer ── */}
      <div className="div" />
      {invoice.saleCondition && (
        <p className="sm">
          Cond. cobro: {invoice.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado'}
        </p>
      )}
      {invoice.paymentTerms && (
        <p className="sm">Cond. venta: {invoice.paymentTerms}</p>
      )}
      {invoice.cae && (
        <>
          <p className="sm">CAE: {invoice.cae}</p>
          <p className="sm">Vto CAE: {invoice.caeExpiry ? fmtDate(invoice.caeExpiry) : ''}</p>
        </>
      )}
      {invoice.notes && (
        <>
          <div className="div" />
          <p className="sm">{invoice.notes}</p>
        </>
      )}
      <div className="div" />
      <p className="c sm">Gracias por su compra</p>
    </>
  );
}
