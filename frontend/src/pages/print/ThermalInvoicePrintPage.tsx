import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { invoicesService, afipService } from '../../services';
import companiesService from '../../services/companies.service';
import { formatCuit } from '../../utils/formatters';
import {
  afipInvoiceNumber,
  buildAfipQrUrl,
  buildCaeBarcodeDigits,
  fiscalTransparency,
  invoiceLetter,
  invoiceTypeName,
  FISCAL_TRANSPARENCY_LEGEND,
} from '../../utils/afipFiscal';
import Itf14Barcode from '../../components/shared/Itf14Barcode';
import type { Invoice } from '../../types';
import type { AfipConfigSummary } from '../../types/afip.types';
import type { Company } from '../../types/company.types';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function ThermalInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [afip, setAfip] = useState<AfipConfigSummary | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
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

  // El QR de ARCA se genera de forma asincrónica: hay que tenerlo listo ANTES
  // de disparar window.print(), o el ticket sale sin QR.
  useEffect(() => {
    if (!invoice) return;
    const cuit = afip?.cuit || company?.cuit;
    const url = buildAfipQrUrl(invoice, cuit, afip?.salePoint);
    if (!url) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 220, margin: 0 })
      .then((dataUrl) => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [invoice, afip, company]);

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

  // Encabezado de empresa: prioriza la config AFIP; si falta, cae a los datos de la empresa
  const issuer = {
    name:          afip?.businessName    || company?.name          || '',
    tradeName:     company?.name         || '',
    address:       afip?.businessAddress || company?.address        || '',
    cuit:          afip?.cuit            || company?.cuit           || '',
    taxCondition:  afip?.taxCondition    || company?.taxCondition   || '',
    grossIncome:   afip?.grossIncome     || company?.grossIncome    || '',
    activityStart: afip?.activityStartDate || '',
    consumerDefense: afip?.consumerDefensePhone || '',
  };

  const letter = invoiceLetter(invoice.type);
  const typeName = invoiceTypeName(invoice.type);
  const isTypeC = letter === 'C';
  const transparency = fiscalTransparency(invoice);
  const barcodeDigits = buildCaeBarcodeDigits(invoice, issuer.cuit, afip?.salePoint);

  // El nombre de fantasía sólo se muestra si difiere de la razón social,
  // para no repetir la misma línea dos veces.
  const showTradeName = issuer.tradeName && issuer.tradeName !== issuer.name;

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
        .xs { font-size: 9px; }
        .div { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; }
        .letter-box {
          border: 2px solid #000; border-radius: 4px; width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; font-weight: bold; line-height: 1;
        }
        .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
        /* Tabla de ítems: Cant. | Descripción | Precio | Subtotal */
        .items { width: 100%; border-collapse: collapse; }
        .items th { font-weight: bold; text-align: left; font-size: 10px; padding-bottom: 2px; }
        .items td { vertical-align: top; padding: 1px 0; }
        .items .qty   { width: 30px; }
        .items .price { width: 52px; text-align: right; }
        .items .sub   { width: 58px; text-align: right; }
        .items .desc  { word-break: break-word; padding-right: 3px; }
        .fiscal-box { border: 1px solid #000; padding: 4px; margin: 4px 0; }
      `}</style>

      {/* ── Encabezado: letra + tipo/número + fecha ── */}
      <div className="head">
        <div className="letter-box">{letter}</div>
        <div className="r" style={{ flex: 1 }}>
          <p className="sm">{fmtDate(invoice.date ?? invoice.createdAt)}</p>
          <p className="b">{typeName}</p>
          <p>{afipInvoiceNumber(invoice)}</p>
        </div>
      </div>

      <div className="div" />

      {/* ── Datos del emisor ── */}
      {showTradeName && <p className="c b lg">{issuer.tradeName}</p>}
      {issuer.name && (
        <p className={showTradeName ? 'c sm' : 'c b lg'}>{issuer.name}</p>
      )}
      {issuer.address && <p className="c sm">{issuer.address}</p>}
      {issuer.cuit && (
        <p className="c sm">
          C.U.I.T.: {formatCuit(issuer.cuit)}
          {issuer.taxCondition ? ` — ${issuer.taxCondition.replace(/_/g, ' ')}` : ''}
        </p>
      )}
      {issuer.grossIncome && <p className="c sm">Ingresos Brutos: {issuer.grossIncome}</p>}
      {issuer.activityStart && (
        <p className="c sm">Inicio de Actividad: {fmtDate(issuer.activityStart)}</p>
      )}

      <div className="div" />

      {/* ── Cliente ── */}
      {invoice.customer ? (
        <>
          <p className="b">Cliente: {invoice.customer.name}</p>
          {invoice.customer.taxId && <p className="sm">CUIT/DNI: {formatCuit(invoice.customer.taxId)}</p>}
          {invoice.customer.taxCondition && (
            <p className="sm">{invoice.customer.taxCondition.replace(/_/g, ' ')}</p>
          )}
          {invoice.customer.address && <p className="sm">{invoice.customer.address}</p>}
        </>
      ) : (
        <p className="b">Cliente CONSUMIDOR FINAL</p>
      )}

      <div className="div" />

      {/* ── Ítems ── */}
      <table className="items">
        <thead>
          <tr>
            <th className="qty">Cant.</th>
            <th className="desc">Descripción</th>
            <th className="price">Precio</th>
            <th className="sub">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items ?? []).map((item, i) => (
            <tr key={i}>
              <td className="qty">{fmt(item.quantity)}</td>
              <td className="desc">{item.description ?? item.product?.name ?? ''}</td>
              <td className="price">{fmt(item.unitPrice)}</td>
              <td className="sub">{fmt(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="div" style={{ borderStyle: 'solid' }} />

      {/* ── Totales ── */}
      <div className="row">
        <span>SubTotal $</span>
        <span>{fmt(invoice.subtotal)}</span>
      </div>
      {!isTypeC && Number(invoice.taxAmount) > 0 && (
        <div className="row">
          <span>IVA $</span>
          <span>{fmt(invoice.taxAmount)}</span>
        </div>
      )}
      <div className="div" />
      <div className="row b lg">
        <span>TOTAL {invoice.currency === 'USD' ? 'U$D' : '$'}</span>
        <span>{fmt(invoice.total)}</span>
      </div>

      {/* ── Régimen de Transparencia Fiscal (Ley 27.743) ── */}
      {transparency.applies && (
        <div className="fiscal-box">
          <p className="sm b">{FISCAL_TRANSPARENCY_LEGEND}</p>
          {transparency.showAmount && (
            <div className="row b" style={{ marginTop: 2 }}>
              <span>I.V.A. Contenido $</span>
              <span>{fmt(transparency.ivaContenido)}</span>
            </div>
          )}
        </div>
      )}

      {issuer.consumerDefense && <p className="sm">{issuer.consumerDefense}</p>}

      {/* ── Condiciones ── */}
      <div className="div" />
      {invoice.saleCondition && (
        <p className="sm">
          Cond. cobro: {invoice.saleCondition === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : 'Contado'}
        </p>
      )}
      {invoice.paymentTerms && <p className="sm">Cond. venta: {invoice.paymentTerms}</p>}

      {/* ── CAE: código de barras + datos ── */}
      {invoice.cae && (
        <>
          {barcodeDigits && (
            <div style={{ marginTop: 4 }}>
              <Itf14Barcode value={barcodeDigits} height={38} />
              <p className="xs c" style={{ letterSpacing: '0.5px' }}>{barcodeDigits}</p>
            </div>
          )}
          {invoice.caeExpiry && <p className="sm">Vencimiento: {fmtDate(invoice.caeExpiry)}</p>}
          <div className="row sm">
            <span>CAE: {invoice.cae}</span>
            <span>Original</span>
          </div>
          {qrDataUrl && (
            <div className="c" style={{ marginTop: 4 }}>
              <img src={qrDataUrl} alt="QR ARCA" style={{ width: '28mm', height: '28mm' }} />
            </div>
          )}
        </>
      )}

      {!invoice.cae && invoice.status !== 'DRAFT' && (
        <p className="sm c">Comprobante sin CAE — no válido como factura</p>
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
