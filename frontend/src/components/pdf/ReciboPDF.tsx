import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Recibo } from '../../types/recibo.types';
import type { PrintContext } from '../../utils/printContext';
import { afipInvoiceNumber } from '../../utils/afipFiscal';
import { amountToWords } from '../../utils/numberToWords';
import { formatChequeNumber } from '../../utils/chequeNumber';
import { DocHeader, KV } from './pdfShared';
import {
  ps, INK, LABEL, SOFT, fmtMoney, fmtNum, fmtDate, todayText, fmtCuit, fmtCode, docTypeShort, paymentMethodText,
} from './pdfFormat';

// Recibo de cobro a cliente, línea "Clásico refinado": X — documento no válido
// como factura, tabla de comprobantes cancelados y forma de pago, total en
// letras y firma. En el sistema un recibo cobra UN comprobante con UN medio de
// pago, así que cada tabla lleva una fila (o "Pago a cuenta" si no imputa).

const s = StyleSheet.create({
  cDate: { width: 67.5 },
  cType: { width: 52.5 },
  cNum: { flex: 1 },
  cTotal: { width: 90, textAlign: 'right' },
  cPaid: { width: 90, textAlign: 'right' },
  pMethod: { width: 67.5 },
  pBank: { flex: 1, paddingRight: 6 },
  pNum: { width: 112.5 },
  pDue: { width: 67.5 },
  pAmount: { width: 90, textAlign: 'right' },
  blockTitle: { fontSize: 7.9, fontWeight: 600, letterSpacing: 0.45, textTransform: 'uppercase', marginBottom: 3 },
});

function sourceRow(r: Recibo): { date: string; type: string; number: string; total: number | null } | null {
  if (r.invoice) {
    return {
      date: fmtDate(r.invoice.date ?? r.date),
      type: docTypeShort(r.invoice.type),
      number: afipInvoiceNumber({ number: r.invoice.number, afipPtVenta: r.invoice.afipPtVenta ?? null, afipCbtNum: r.invoice.afipCbtNum ?? null }),
      total: r.invoice.total != null ? Number(r.invoice.total) : null,
    };
  }
  if (r.budget) {
    return { date: fmtDate(r.budget.date ?? r.date), type: 'PRES', number: r.budget.number, total: r.budget.total != null ? Number(r.budget.total) : null };
  }
  if (r.ordenPedido) {
    return { date: fmtDate(r.ordenPedido.date ?? r.date), type: 'O.PED', number: r.ordenPedido.number, total: r.ordenPedido.total != null ? Number(r.ordenPedido.total) : null };
  }
  return null;
}

/** Medio / banco / número / vto. del cobro. */
function paymentCols(r: Recibo): [string, string, string, string] {
  switch (r.paymentMethod) {
    case 'CHECK':
      return ['Cheque', r.bank ?? '', r.reference ? formatChequeNumber(r.reference) : '', r.checkDueDate ? fmtDate(r.checkDueDate) : ''];
    case 'BANK_TRANSFER':
      return ['Transferencia', r.bank ?? '', r.reference ?? '', ''];
    case 'CARD': {
      const card = (r as { card?: { name?: string } }).card?.name ?? '';
      return ['Tarjeta', [card, r.installments ? `${r.installments} cuota(s)` : ''].filter(Boolean).join(' · '), r.reference ?? '', ''];
    }
    case 'CASH':
      return ['Efectivo', r.currency === 'USD' ? `Dólares · cotización ${fmtNum(r.exchangeRate)}` : 'Pesos', '', ''];
    case 'MERCADO_PAGO':
      return ['Mercado Pago', '', r.reference ?? '', ''];
    case 'COMPENSACION':
      return ['Compensación', r.creditInvoiceId ? 'Nota de crédito aplicada' : 'Saldo a favor aplicado', '', ''];
    default: {
      const label = paymentMethodText(r.paymentMethod);
      return [label.charAt(0) + label.slice(1).toLowerCase(), r.bank ?? '', r.reference ?? '', ''];
    }
  }
}

export default function ReciboPDF({ recibo, ctx }: { recibo: Recibo; ctx: PrintContext }) {
  const { issuer } = ctx;
  const currency = recibo.currency ?? 'ARS';
  const amount = Number(recibo.amount) || 0;
  const src = sourceRow(recibo);
  const pay = paymentCols(recibo);
  const c = recibo.customer;
  const surcharge = Number((recibo as { surchargeAmount?: number }).surchargeAmount) || 0;

  return (
    <Document title={`Recibo ${recibo.number}`} author={issuer.name || 'Cloud-Bill'}>
      <Page size="A4" style={ps.page}>
        {recibo.status === 'CANCELLED' && <Text style={ps.watermark}>ANULADO</Text>}

        <DocHeader
          logoSlot
          issuer={issuer}
          hideWebsite
          letter="X"
          letterCaption={'DOCUMENTO NO VÁLIDO\nCOMO FACTURA'}
          centerWidth={112}
          stem={false}
          title="RECIBO"
          number={recibo.number}
          rows={[
            ['Fecha', fmtDate(recibo.date)],
            ['Caja', recibo.cashRegister?.name],
            ['CUIT', fmtCuit(issuer.cuit)],
            ['IIBB', issuer.grossIncome],
            ['Cond. IVA', issuer.taxCondition],
          ]}
        />
        <View style={ps.accentRule} />

        {/* ── Cliente ─────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: INK }}>
          <View style={{ flex: 1 }}>
            <View style={ps.kv}>
              <Text style={{ width: 62, color: LABEL }}>Recibimos de</Text>
              <Text style={{ flex: 1, fontWeight: 600 }}>{c?.name ?? ''}</Text>
            </View>
            <KV
              labelWidth={62}
              rows={[
                ['CUIT', fmtCuit(c?.taxId)],
                ['Domicilio', [c?.address, [c?.city, c?.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ')],
              ]}
            />
          </View>
          {c?.code ? (
            <Text style={{ color: LABEL }}>
              Cliente Nº <Text style={{ fontFamily: 'PlexMono', fontSize: 8.25, color: INK }}>{fmtCode(c.code)}</Text>
            </Text>
          ) : null}
        </View>

        {/* ── Comprobantes cancelados ─────────────────────── */}
        <Text style={[s.blockTitle, { marginTop: 16.5 }]}>Comprobantes cancelados</Text>
        <View style={ps.tableHead}>
          <Text style={[ps.th, s.cDate]}>Fecha</Text>
          <Text style={[ps.th, s.cType]}>Tipo</Text>
          <Text style={[ps.th, s.cNum]}>Número</Text>
          <Text style={[ps.th, s.cTotal]}>Total</Text>
          <Text style={[ps.th, s.cPaid]}>Monto pago</Text>
        </View>
        <View style={ps.tableRow}>
          {src ? (
            <>
              <Text style={s.cDate}>{src.date}</Text>
              <Text style={s.cType}>{src.type}</Text>
              <Text style={[ps.mono, s.cNum]}>{src.number}</Text>
              <Text style={s.cTotal}>{src.total != null ? fmtNum(src.total) : ''}</Text>
            </>
          ) : (
            <Text style={{ flex: 1 }}>Pago a cuenta</Text>
          )}
          <Text style={s.cPaid}>{fmtNum(amount)}</Text>
        </View>

        {/* ── Forma de pago ───────────────────────────────── */}
        <Text style={[s.blockTitle, { marginTop: 19.5 }]}>Forma de pago</Text>
        <View style={ps.tableHead}>
          <Text style={[ps.th, s.pMethod]}>Medio</Text>
          <Text style={[ps.th, s.pBank]}>Banco / detalle</Text>
          <Text style={[ps.th, s.pNum]}>Número</Text>
          <Text style={[ps.th, s.pDue]}>Vto.</Text>
          <Text style={[ps.th, s.pAmount]}>Importe</Text>
        </View>
        <View style={ps.tableRow}>
          <Text style={s.pMethod}>{pay[0]}</Text>
          <Text style={s.pBank}>{pay[1]}</Text>
          <Text style={[ps.mono, s.pNum]}>{pay[2]}</Text>
          <Text style={s.pDue}>{pay[3]}</Text>
          <Text style={s.pAmount}>{fmtNum(amount)}</Text>
        </View>
        {surcharge > 0 ? (
          <Text style={{ fontSize: 8.25, color: LABEL, paddingHorizontal: 3, paddingTop: 3 }}>
            Recargo tarjeta {(recibo as { surchargePercent?: number }).surchargePercent}%: {fmtMoney(surcharge, currency)} (informativo)
          </Text>
        ) : null}
        {currency === 'USD' && Number(recibo.exchangeRate) > 1 ? (
          <Text style={{ fontSize: 8.25, color: LABEL, paddingHorizontal: 3, paddingTop: 3 }}>
            Cotización {fmtMoney(recibo.exchangeRate)} · equivalente {fmtMoney(amount * Number(recibo.exchangeRate))}
          </Text>
        ) : null}

        {/* ── Total ───────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 13.5 }}>
          <View style={[ps.box, { width: 225, paddingVertical: 9, paddingHorizontal: 10.5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
            <Text style={{ fontWeight: 600, fontSize: 9.75 }}>TOTAL RECIBIDO</Text>
            <Text style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtMoney(amount, currency)}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 8.25, color: SOFT, textAlign: 'right', paddingTop: 6, paddingHorizontal: 3 }}>
          Son {currency === 'USD' ? 'dólares' : 'pesos'}: {amountToWords(amount, currency)}.
        </Text>
        {recibo.notes ? <Text style={{ paddingTop: 6, paddingHorizontal: 3 }}><Text style={{ color: LABEL }}>Observaciones </Text>{recibo.notes}</Text> : null}

        <View style={{ flexGrow: 1 }} />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 22, marginBottom: 60 }}>
          <View style={ps.signLine}><Text style={{ color: SOFT }}>Firma y aclaración</Text></View>
        </View>

        <View fixed style={ps.footer}>
          <Text style={ps.footerText}>Impreso el {todayText()}</Text>
          <Text style={ps.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
