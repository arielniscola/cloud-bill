import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { OrdenPago } from '../../types/ordenPago.types';
import type { PrintContext } from '../../utils/printContext';
import { amountToWords } from '../../utils/numberToWords';
import { RETENTION_TYPE_OPTIONS } from '../../utils/constants';
import { formatChequeNumber } from '../../utils/chequeNumber';
import { DocHeader, KV } from './pdfShared';
import {
  ps, INK, LABEL, SOFT, fmtMoney, fmtNum, fmtDate, fmtCuit, fmtCode, todayText, docTypeShort, paymentMethodText,
} from './pdfFormat';

// Orden de pago a proveedor, línea "Clásico refinado": encabezado de la empresa,
// proveedor con código y domicilio, comprobantes cancelados, forma de pago
// (cada cheque con banco, número, vencimiento e importe, y el resto por el
// medio de la orden), total en letras, observaciones, usuario y firma. Las
// retenciones y ajustes, que el modelo no tiene, se imprimen porque cambian el
// neto pagado.

const RETENTION_LABELS: Record<string, string> = Object.fromEntries(RETENTION_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const s = StyleSheet.create({
  cDate: { width: 67.5 },
  cType: { width: 52.5 },
  cNum: { flex: 1 },
  cTotal: { width: 97.5, textAlign: 'right' },
  cPaid: { width: 97.5, textAlign: 'right' },
  pMethod: { width: 67.5 },
  pKind: { width: 52.5, color: LABEL },
  pBank: { flex: 1, paddingRight: 6 },
  pNum: { width: 112.5 },
  pDue: { width: 60 },
  pAmount: { width: 90, textAlign: 'right' },
  blockTitle: { fontSize: 7.9, fontWeight: 600, letterSpacing: 0.45, textTransform: 'uppercase', marginBottom: 3 },
  adjRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: '#e3e3e3' },
});

function titleCase(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

export default function OrdenPagoPDF({ op, ctx }: { op: OrdenPago; ctx: PrintContext }) {
  const { issuer } = ctx;
  const currency = op.currency;
  const sup = op.supplier;
  const net = Number(op.amount) - Number(op.retentionAmount ?? 0);
  const cheques = op.cheques ?? [];
  const chequesTotal = cheques.reduce((acc, c) => acc + Number(c.amount), 0);
  // Lo que no se pagó con cheques sale por el medio de la orden.
  const rest = Math.round((net - chequesTotal) * 100) / 100;
  const restLabel = op.paymentMethod === 'CHECK' ? 'Otros' : titleCase(paymentMethodText(op.paymentMethod));
  const items = op.items ?? [];
  const status = op.status === 'PAID' ? 'Pagada' : op.status === 'CANCELLED' ? 'Anulada' : 'Emitida';

  return (
    <Document title={`Orden de Pago ${op.number}`} author={issuer.name || 'Cloud-Bill'}>
      <Page size="A4" style={ps.page}>
        {op.status === 'CANCELLED' && <Text style={ps.watermark}>ANULADA</Text>}

        <DocHeader
          logoSlot
          issuer={issuer}
          centerWidth={30}
          title="ORDEN DE PAGO"
          number={op.number}
          rows={[
            ['Fecha', fmtDate(op.date)],
            ['Estado', status],
            ['CUIT', fmtCuit(issuer.cuit)],
            ['Cond. IVA', issuer.taxCondition],
          ]}
        />
        <View style={ps.accentRule} />

        {/* ── Proveedor ───────────────────────────────────── */}
        <View style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: INK }}>
          <View style={{ flex: 1.25, paddingRight: 21 }}>
            <View style={ps.kv}>
              <Text style={{ width: 55, color: LABEL }}>Proveedor</Text>
              <Text style={{ flex: 1 }}>
                <Text style={{ fontWeight: 600 }}>{sup?.name ?? ''}</Text>
                {sup?.code ? <Text style={{ fontFamily: 'PlexMono', fontSize: 8.25, color: LABEL }}>{`  · ${fmtCode(sup.code)}`}</Text> : null}
              </Text>
            </View>
            <KV
              labelWidth={55}
              rows={[
                ['Domicilio', sup?.address],
                ['Localidad', sup?.city],
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <KV
              labelWidth={55}
              rows={[
                ['CUIT', fmtCuit(sup?.cuit) || '-'],
                ['Teléfono', sup?.phone || '-'],
                ['E-mail', sup?.email],
              ]}
            />
          </View>
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
        {items.length === 0 ? (
          <View style={ps.tableRow}>
            <Text style={{ flex: 1 }}>Pago a cuenta</Text>
            <Text style={s.cPaid}>{fmtNum(op.amount)}</Text>
          </View>
        ) : items.map((i) => (
          <View key={i.id} style={ps.tableRow} wrap={false}>
            <Text style={s.cDate}>{fmtDate(i.invoice?.date ?? i.purchase?.date ?? null)}</Text>
            <Text style={s.cType}>{i.invoice ? docTypeShort(i.invoice.type) : 'COMP'}</Text>
            <Text style={[ps.mono, s.cNum]}>{i.invoice?.number ?? i.purchase?.number ?? ''}</Text>
            {(() => {
              // Factura en otra moneda que la OP (p.ej. FC en USD pagada en pesos):
              // cada columna dice su moneda y el pago muestra a cuánto equivale.
              const invCur = i.invoice?.currency ?? currency;
              const foreign = !!i.invoice && invCur !== currency;
              const rate = Number(op.exchangeRate) || 1;
              return (
                <>
                  <Text style={s.cTotal}>
                    {i.invoice ? (foreign ? fmtMoney(i.invoice.amount, invCur) : fmtNum(i.invoice.amount)) : i.purchase ? fmtNum(i.purchase.total) : ''}
                  </Text>
                  <View style={s.cPaid}>
                    <Text style={{ textAlign: 'right' }}>{foreign ? fmtMoney(i.amount, currency) : fmtNum(i.amount)}</Text>
                    {foreign && rate > 0 ? (
                      <Text style={{ textAlign: 'right', fontSize: 7.1, color: LABEL }}>
                        = {fmtMoney(Number(i.amount) / rate, invCur)} · cot. {fmtNum(rate)}
                      </Text>
                    ) : null}
                  </View>
                </>
              );
            })()}
          </View>
        ))}
        {Number(op.onAccountAmount ?? 0) > 0 && items.length > 0 ? (
          <View style={ps.tableRow}>
            <Text style={{ flex: 1 }}>Excedente a cuenta</Text>
            <Text style={s.cPaid}>{fmtNum(op.onAccountAmount)}</Text>
          </View>
        ) : null}

        {/* ── Ajustes y retenciones ───────────────────────── */}
        {((op.ajustes ?? []).length > 0 || (op.retenciones ?? []).length > 0) && (
          <View style={{ marginTop: 14 }}>
            <Text style={ps.sectionTitle}>Ajustes y retenciones</Text>
            {(op.ajustes ?? []).map((a) => (
              <View key={a.id} style={s.adjRow}>
                <Text style={{ width: 120 }}>{a.type === 'SUMA' ? 'Interés' : 'Descuento'}</Text>
                <Text style={{ flex: 1, color: LABEL }}>{a.description}</Text>
                <Text style={{ width: 97.5, textAlign: 'right' }}>{a.type === 'SUMA' ? '' : '- '}{fmtNum(a.amount)}</Text>
              </View>
            ))}
            {(op.retenciones ?? []).map((r) => (
              <View key={r.id} style={s.adjRow}>
                <Text style={{ width: 120 }}>Retención {RETENTION_LABELS[r.type] ?? r.type}</Text>
                <Text style={{ flex: 1, color: LABEL }}>
                  {[r.jurisdiction, `${fmtNum(r.baseAmount)} × ${Number(r.percentage).toLocaleString('es-AR')}%`, r.certificate ? `cert. ${r.certificate}` : '']
                    .filter(Boolean).join(' · ')}
                </Text>
                <Text style={{ width: 97.5, textAlign: 'right' }}>- {fmtNum(r.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Forma de pago ───────────────────────────────── */}
        <Text style={[s.blockTitle, { marginTop: 19.5 }]}>Forma de pago</Text>
        <View style={ps.tableHead}>
          <Text style={[ps.th, s.pMethod]}>Medio</Text>
          <Text style={[ps.th, s.pKind]}>Tipo</Text>
          <Text style={[ps.th, s.pBank]}>Banco</Text>
          <Text style={[ps.th, s.pNum]}>Número</Text>
          <Text style={[ps.th, s.pDue]}>Vto.</Text>
          <Text style={[ps.th, s.pAmount]}>Importe</Text>
        </View>
        {cheques.map((c) => (
          <View key={c.id} style={ps.tableRow} wrap={false}>
            <Text style={s.pMethod}>Cheque</Text>
            <Text style={s.pKind}>{c.type === 'EGRESO' ? 'Propio' : 'Endosado'}</Text>
            <Text style={s.pBank}>{c.bank ?? ''}</Text>
            <Text style={[ps.mono, s.pNum]}>{c.checkNumber ? formatChequeNumber(c.checkNumber) : c.number}</Text>
            <Text style={s.pDue}>{fmtDate(c.dueDate)}</Text>
            <Text style={s.pAmount}>{fmtNum(c.amount)}</Text>
          </View>
        ))}
        {rest > 0.005 && (
          <View style={ps.tableRow}>
            <Text style={[s.pMethod, { width: 120 }]}>{restLabel}</Text>
            <Text style={s.pBank}>{op.bank ?? ''}</Text>
            <Text style={[ps.mono, s.pNum, { width: 172.5 }]}>{op.reference ?? ''}</Text>
            <Text style={s.pAmount}>{fmtNum(rest)}</Text>
          </View>
        )}

        {/* ── Total ───────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 13.5 }}>
          <View style={[ps.box, { width: 225, paddingVertical: 9, paddingHorizontal: 10.5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
            <Text style={{ fontWeight: 600, fontSize: 9.75 }}>{Number(op.retentionAmount) > 0 ? 'NETO PAGADO' : 'TOTAL PAGADO'}</Text>
            <Text style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtMoney(net, currency)}</Text>
          </View>
        </View>
        {currency === 'USD' && Number(op.exchangeRate) > 1 ? (
          <Text style={{ fontSize: 8.25, color: LABEL, textAlign: 'right', paddingTop: 3, paddingHorizontal: 3 }}>
            Cotización {fmtMoney(op.exchangeRate)} · equivalente {fmtMoney(net * Number(op.exchangeRate))}
          </Text>
        ) : null}
        <Text style={{ fontSize: 8.25, color: SOFT, textAlign: 'right', paddingTop: 6, paddingHorizontal: 3 }}>
          Son {currency === 'USD' ? 'dólares' : 'pesos'}: {amountToWords(net, currency)}.
        </Text>
        {op.notes ? <Text style={{ paddingTop: 8, paddingHorizontal: 3 }}><Text style={{ color: LABEL }}>Observaciones </Text>{op.notes}</Text> : null}

        <View style={{ flexGrow: 1 }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 22, marginBottom: 60 }}>
          <Text style={{ color: SOFT }}>Emitida por <Text style={{ color: INK, fontWeight: 500 }}>{op.user?.name ?? ''}</Text></Text>
          <View style={ps.signLine}><Text style={{ color: SOFT }}>Firma autorizada</Text></View>
        </View>

        <View fixed style={ps.footer}>
          <Text style={ps.footerText}>Impreso el {todayText()}</Text>
          <Text style={ps.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
