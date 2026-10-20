import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cashRegistersService, afipService } from '../../services';
import companiesService from '../../services/companies.service';
import { formatCuit } from '../../utils/formatters';
import { amountToWords } from '../../utils/numberToWords';
import { CASH_CONCEPT_LABELS } from '../../utils/cashMovements';
import type { CashMovement } from '../../types';
import type { AfipConfigSummary } from '../../types/afip.types';
import type { Company } from '../../types/company.types';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
};

// Ticket 80mm del retiro / ingreso de caja: una sola copia con las dos firmas.
export default function ThermalCashMovementPrintPage() {
  const { registerId, movementId } = useParams<{ registerId: string; movementId: string }>();
  const [mov, setMov] = useState<CashMovement | null>(null);
  const [afip, setAfip] = useState<AfipConfigSummary | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!registerId || !movementId) return;
    // Config AFIP y empresa son tolerantes a fallo (fallback del encabezado).
    Promise.all([
      cashRegistersService.getCashMovement(registerId, movementId),
      afipService.getConfig().catch(() => null),
      companiesService.getCurrent().catch(() => null),
    ])
      .then(([data, cfg, comp]) => { setMov(data); setAfip(cfg); setCompany(comp); setReady(true); })
      .catch(() => { document.title = 'Error'; });
  }, [registerId, movementId]);

  useEffect(() => {
    if (!ready || !mov) return;
    document.title = `${mov.type === 'OUT' ? 'Retiro' : 'Ingreso'} ${mov.number}`;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready, mov]);

  if (!ready || !mov) {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, padding: 8, width: 280 }}>
        Cargando...
      </div>
    );
  }

  const issuer = {
    name:    afip?.businessName    || company?.name    || '',
    address: afip?.businessAddress || company?.address || '',
    cuit:    afip?.cuit            || company?.cuit    || '',
  };
  const isOut = mov.type === 'OUT';
  const amount = Number(mov.amount) || 0;
  const bank = mov.bankAccount
    ? [mov.bankAccount.bank, mov.bankAccount.name, mov.bankAccount.accountNumber].filter(Boolean).join(' · ')
    : '';

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 3mm 4mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; width: 72mm; }
        @media screen { body { max-width: 320px; padding: 12px; background: #f5f5f5; } }
        @media print { body { background: #fff; } }
        .c  { text-align: center; }
        .b  { font-weight: bold; }
        .lg { font-size: 13px; }
        .sm { font-size: 10px; }
        .div { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .sign { border-top: 1px solid #000; margin-top: 34px; padding-top: 2px; text-align: center; }
      `}</style>

      {/* ── Company header ── */}
      {issuer.name && <p className="c b lg">{issuer.name}</p>}
      {issuer.address && <p className="c sm">{issuer.address}</p>}
      {issuer.cuit && <p className="c sm">CUIT: {formatCuit(issuer.cuit)}</p>}

      <div className="div" />

      {/* ── Document header ── */}
      <p className="c b">{isOut ? 'RETIRO DE CAJA' : 'INGRESO A CAJA'}</p>
      <p className="c">N° {mov.number}</p>
      <p className="c sm">{fmtDateTime(mov.createdAt)}</p>
      {mov.status === 'CANCELLED' && <p className="c b">*** ANULADO ***</p>}

      <div className="div" />

      <div className="row sm"><span>Caja</span><span>{mov.cashRegister?.name}</span></div>
      <div className="row sm"><span>Concepto</span><span>{CASH_CONCEPT_LABELS[mov.concept] ?? mov.concept}</span></div>
      {mov.personName && (
        <div className="row sm"><span>{isOut ? 'Retiró' : 'Entregó'}</span><span>{mov.personName}</span></div>
      )}
      {bank && <p className="sm">Cuenta: {bank}</p>}
      {mov.user?.name && <div className="row sm"><span>Registró</span><span>{mov.user.name}</span></div>}
      {mov.notes && <p className="sm" style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{mov.notes}</p>}

      <div className="div" style={{ borderStyle: 'solid' }} />
      <div className="row b lg">
        <span>{isOut ? 'RETIRADO' : 'INGRESADO'}</span>
        <span>${fmt(amount)}</span>
      </div>
      <p className="sm">Son pesos: {amountToWords(amount)}.</p>

      <p className="sign sm">{isOut ? 'Recibió · firma y aclaración' : 'Entregó · firma y aclaración'}</p>
      <p className="sign sm">Caja · firma</p>

      <div className="div" />
      <p className="c sm">Comprobante interno · no válido como factura</p>
    </>
  );
}
