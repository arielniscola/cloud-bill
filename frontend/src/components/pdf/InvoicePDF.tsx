import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Invoice, InvoiceItem } from '../../types/invoice.types';
import type { Recibo } from '../../types/recibo.types';
import type { PrintContext } from '../../utils/printContext';
import {
  fiscalTransparency, FISCAL_TRANSPARENCY_LEGEND, afipTypeCode, invoiceLetter, invoiceTypeName, afipInvoiceNumber,
} from '../../utils/afipFiscal';
import { amountToWords } from '../../utils/numberToWords';
import { formatChequeNumber } from '../../utils/chequeNumber';
import { DocHeader, KV } from './pdfShared';
import {
  ps, INK, LABEL, SOFT, HAIR, PLACEHOLDER, fmtMoney, fmtNum, fmtQty, fmtDate, fmtCuit, fmtCode,
  taxConditionTitle, saleConditionTitle,
} from './pdfFormat';

// Factura / NC / ND fiscal (A, B, C), línea "Clásico refinado":
//   · encabezado emisor | letra + código ARCA | comprobante y datos fiscales
//   · cliente con código, CUIT, IIBB, domicilio, condición de venta e IVA
//   · ítems Código / Descripción / Cant. / P. Unit. / Bonif. / Total a precio
//     final (IVA incluido), como el modelo de referencia, en todas las letras
//   · forma de pago (cada cobro registrado) y datos de entrega lado a lado
//   · recuadro final con QR, CAE y totales; la A discrimina IVA 21 % y 10,5 %
//     siempre (y otras alícuotas si se usaron)

const COLS = { code: 63, qty: 39, price: 69, bonif: 34.5, total: 73.5 };

const s = StyleSheet.create({
  customer: {
    flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 3,
    borderBottomWidth: 0.75, borderBottomColor: INK,
  },
  colCode: { width: COLS.code },
  colDesc: { flex: 1, paddingRight: 6 },
  colQty: { width: COLS.qty, textAlign: 'right' },
  colPrice: { width: COLS.price, textAlign: 'right' },
  colBonif: { width: COLS.bonif, textAlign: 'right' },
  colTotal: { width: COLS.total, textAlign: 'right' },
  payRow: { flexDirection: 'row', paddingVertical: 3.75, borderBottomWidth: 0.75, borderBottomColor: HAIR },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2.25 },
  qr: {
    width: 72, height: 72, borderWidth: 0.75, borderStyle: 'dashed', borderColor: PLACEHOLDER,
    alignItems: 'center', justifyContent: 'center',
  },
});

interface InvoicePDFProps {
  invoice: Invoice;
  ctx: PrintContext;
  qrCodeDataUrl?: string;
  /** Cobros emitidos de la factura (forma de pago). */
  payments?: Recibo[];
  /** Remitos vinculados. */
  remitos?: { number: string }[];
}

function itemCode(item: InvoiceItem): string {
  return item.variant?.sku || item.product?.sku || '';
}

function itemDescription(item: InvoiceItem): string {
  const base = item.description || item.product?.name || 'Producto';
  return item.variant?.name ? `${base} - ${item.variant.name}` : base;
}

/** Precio unitario final (IVA incluido, antes de la bonificación). */
function grossUnitPrice(item: InvoiceItem): number {
  return Number(item.unitPrice) * (1 + Number(item.taxRate) / 100);
}

/** Una fila por cobro: medio, detalle (banco / número / vto.) e importe. */
function paymentRows(payments: Recibo[]) {
  return payments.map((p) => {
    const parts: string[] = [];
    let method = p.paymentMethod as string;
    switch (p.paymentMethod) {
      case 'CASH':
        method = 'Efectivo';
        parts.push(p.currency === 'USD' ? `Dólares · cotización ${fmtNum(p.exchangeRate)}` : 'Pesos');
        break;
      case 'BANK_TRANSFER':
        method = 'Transferencia';
        if (p.bank) parts.push(p.bank);
        if (p.reference) parts.push(p.reference);
        break;
      case 'CHECK':
        method = 'Cheque';
        if (p.bank) parts.push(p.bank);
        if (p.reference) parts.push(formatChequeNumber(p.reference));
        if (p.checkDueDate) parts.push(`vto. ${fmtDate(p.checkDueDate)}`);
        break;
      case 'CARD': {
        method = 'Tarjeta';
        const card = (p as { card?: { name?: string } }).card?.name;
        if (card) parts.push(card);
        if (p.installments) parts.push(`${p.installments} cuota(s)`);
        break;
      }
      case 'MERCADO_PAGO':
        method = 'Mercado Pago';
        if (p.reference) parts.push(p.reference);
        break;
      case 'COMPENSACION':
        // Saldo a favor aplicado (NC, NC interna o pago a cuenta): no es plata.
        method = 'Compensación';
        parts.push(p.creditInvoiceId ? 'Nota de crédito' : 'Saldo a favor');
        break;
    }
    return { id: p.id, method, detail: parts.join(' · '), amount: Number(p.amount) || 0, currency: p.currency };
  });
}

export default function InvoicePDF({ invoice, ctx, qrCodeDataUrl, payments = [], remitos = [] }: InvoicePDFProps) {
  const { issuer } = ctx;
  const letter = invoiceLetter(invoice.type);
  const isTypeA = letter === 'A';
  const isDraft = invoice.status === 'DRAFT';
  const isCancelled = invoice.status === 'CANCELLED';
  const currency = invoice.currency;
  const customer = invoice.customer;
  const transparency = fiscalTransparency(invoice);
  const typeName = invoiceTypeName(invoice.type).replace('CREDITO', 'CRÉDITO').replace('DEBITO', 'DÉBITO');

  // Totales: neto antes de bonificación, bonificación, subtotal (neto) e IVA por alícuota.
  const items = invoice.items ?? [];
  const netBeforeDiscount = items.reduce((acc, i) => acc + Number(i.quantity) * Number(i.unitPrice), 0);
  const discountNet = Math.max(0, netBeforeDiscount - Number(invoice.subtotal));
  const ivaByRate = new Map<number, number>();
  if (isTypeA) { ivaByRate.set(21, 0); ivaByRate.set(10.5, 0); }
  for (const i of items) {
    const rate = Number(i.taxRate);
    if (rate === 0 && !ivaByRate.has(0)) continue;
    ivaByRate.set(rate, (ivaByRate.get(rate) ?? 0) + Number(i.taxAmount));
  }
  // B / C: subtotal a precio final antes de la bonificación.
  const grossBeforeDiscount = items.reduce((acc, i) => acc + Number(i.quantity) * grossUnitPrice(i), 0);
  const discountGross = Math.max(0, grossBeforeDiscount - Number(invoice.total));

  const rows = paymentRows(payments.filter((p) => p.status === 'EMITTED'));
  const saleCond = saleConditionTitle(invoice.saleCondition, invoice.paymentTerms);
  const origin = invoice.originInvoice
    ? `${invoiceTypeName(invoice.originInvoice.type)} ${invoiceLetter(invoice.originInvoice.type)} ${afipInvoiceNumber(invoice.originInvoice)}`
    : null;

  return (
    <Document title={`${typeName} ${letter} ${afipInvoiceNumber(invoice)}`} author={issuer.name || 'Cloud-Bill'}>
      <Page size="A4" style={ps.page}>
        {isDraft && <Text style={ps.watermark}>BORRADOR</Text>}
        {isCancelled && <Text style={ps.watermark}>ANULADA</Text>}

        {/* ── ENCABEZADO ─────────────────────────────────────── */}
        <DocHeader
          logoSlot
          issuer={issuer}
          letter={letter}
          letterCaption={`COD. ${String(afipTypeCode(invoice.type)).padStart(2, '0')}`}
          title={typeName}
          number={afipInvoiceNumber(invoice)}
          date={{ label: 'Fecha de emisión', value: fmtDate(invoice.date) }}
          rows={[
            ['CUIT', fmtCuit(issuer.cuit)],
            ['Cond. IVA', issuer.taxCondition],
            ['IIBB', issuer.grossIncome],
            ['Inicio actividades', issuer.activityStart ? fmtDate(issuer.activityStart) : ''],
            ['Establecimiento', issuer.establishment],
            ['Vencimiento', invoice.dueDate ? fmtDate(invoice.dueDate) : ''],
          ]}
          kicker={invoice.cae ? 'COMPROBANTE ELECTRÓNICO' : undefined}
        />
        <View style={ps.accentRule} />

        {/* ── CLIENTE ────────────────────────────────────────── */}
        <View style={s.customer}>
          <View style={{ flex: 1.25, paddingRight: 21 }}>
            <View style={ps.kv}>
              <Text style={{ width: 55, color: LABEL }}>Cliente</Text>
              <Text style={{ flex: 1 }}>
                <Text style={{ fontWeight: 600 }}>{customer?.name ?? 'CONSUMIDOR FINAL'}</Text>
                {customer?.code ? <Text style={{ fontFamily: 'PlexMono', fontSize: 8.25, color: LABEL }}>{`  · ${fmtCode(customer.code)}`}</Text> : null}
              </Text>
            </View>
            <KV
              labelWidth={55}
              rows={[
                ['Domicilio', customer?.address || '-'],
                ['Localidad', [customer?.city, customer?.province].filter(Boolean).join(', ') + (customer?.postalCode ? ` · CP ${customer.postalCode}` : '') || '-'],
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <KV
              labelWidth={61}
              rows={[
                ['CUIT', fmtCuit(customer?.taxId) || '-'],
                ['Cond. IVA', taxConditionTitle(customer?.taxCondition) || 'Consumidor Final'],
                ['Ing. Brutos', customer?.grossIncome || '-'],
              ]}
            />
            <View style={ps.kv}>
              <Text style={{ width: 61, color: LABEL }}>Cond. venta</Text>
              <Text style={{ flex: 1, fontWeight: 600 }}>{saleCond}</Text>
            </View>
          </View>
        </View>

        {/* ── ÍTEMS ──────────────────────────────────────────── */}
        <View style={[ps.tableHead, { marginTop: 10.5 }]}>
          <Text style={[ps.th, s.colCode]}>Código</Text>
          <Text style={[ps.th, s.colDesc]}>Descripción</Text>
          <Text style={[ps.th, s.colQty]}>Cant.</Text>
          <Text style={[ps.th, s.colPrice]}>P. unit.</Text>
          <Text style={[ps.th, s.colBonif]}>Bonif.</Text>
          <Text style={[ps.th, s.colTotal]}>Total</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} style={ps.tableRow} wrap={false}>
            <Text style={[ps.mono, s.colCode]}>{itemCode(item)}</Text>
            <Text style={s.colDesc}>{itemDescription(item).toUpperCase()}</Text>
            <Text style={s.colQty}>{fmtQty(item.quantity)}</Text>
            <Text style={s.colPrice}>{fmtNum(grossUnitPrice(item))}</Text>
            <Text style={s.colBonif}>{Number(item.discountPct) > 0 ? `${Number(item.discountPct).toLocaleString('es-AR')}%` : ''}</Text>
            <Text style={s.colTotal}>{fmtNum(item.total)}</Text>
          </View>
        ))}
        <Text style={{ paddingVertical: 4.5, paddingHorizontal: 3, color: LABEL, fontSize: 8.25 }}>
          Precios con IVA incluido · Importes en {currency === 'USD' ? 'dólares' : 'pesos'}
        </Text>

        <View style={{ flexGrow: 1 }} />

        {/* ── PIE ────────────────────────────────────────────── */}
        <View wrap={false}>
          {currency === 'USD' && (
            <Text style={{ fontSize: 8.25, color: SOFT, paddingHorizontal: 3, marginBottom: 8 }}>
              Tipo de cambio de la factura: U$S 1 = {fmtMoney(invoice.exchangeRate)}. Se factura según la cotización tipo
              vendedor del BNA y se ajustará a la cotización del dólar tipo vendedor del BNA al momento del efectivo pago.
            </Text>
          )}

          <View style={{ flexDirection: 'row', paddingHorizontal: 3, paddingBottom: 7.5 }}>
            <View style={{ flex: 1, paddingRight: 21 }}>
              <Text style={ps.sectionTitle}>Forma de pago · {saleCond}</Text>
              {rows.length === 0 ? (
                <Text style={{ paddingVertical: 3.75, color: LABEL }}>Sin cobros registrados</Text>
              ) : rows.map((r) => (
                <View key={r.id} style={s.payRow}>
                  <Text style={{ width: 72 }}>{r.method}</Text>
                  <Text style={{ flex: 1, color: LABEL, paddingRight: 6 }}>{r.detail}</Text>
                  <Text style={{ width: 69, textAlign: 'right' }}>{fmtNum(r.amount)}</Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ps.sectionTitle}>Datos de entrega</Text>
              <View style={{ paddingTop: 3.75 }}>
                <KV
                  labelWidth={61}
                  rows={[
                    ['Remito', remitos.map((r) => r.number).join(' · ') || '-'],
                    ['Transporte', invoice.transport],
                    ['Vendedor', invoice.user?.name],
                    ['Asociado', origin],
                    ['Observ.', invoice.notes],
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={[ps.box, { flexDirection: 'row', padding: 10.5 }]}>
            {qrCodeDataUrl
              ? <Image src={qrCodeDataUrl} style={{ width: 72, height: 72 }} />
              : <View style={s.qr}><Text style={{ fontSize: 8.25, color: LABEL, textAlign: 'center' }}>{'QR\nARCA'}</Text></View>}
            <View style={{ flex: 1, paddingHorizontal: 13.5, justifyContent: 'flex-end' }}>
              {invoice.cae ? (
                <>
                  <Text style={{ color: LABEL, fontSize: 8.25, marginBottom: 2 }}>Comprobante autorizado por ARCA</Text>
                  <Text style={{ marginBottom: 2 }}>CAE <Text style={{ fontFamily: 'PlexMono', fontWeight: 500 }}>{invoice.cae}</Text></Text>
                  {invoice.caeExpiry ? <Text>Vto. CAE <Text style={{ fontWeight: 500 }}>{fmtDate(invoice.caeExpiry)}</Text></Text> : null}
                </>
              ) : (
                <Text style={{ color: LABEL, fontSize: 8.25 }}>
                  {isDraft ? 'Borrador: todavía no fue emitido.' : 'Sin CAE: este comprobante no fue autorizado por ARCA y no tiene validez fiscal.'}
                </Text>
              )}
            </View>
            <View style={{ width: 198 }}>
              {isTypeA ? (
                <>
                  <View style={s.totRow}><Text style={{ color: LABEL }}>Neto gravado</Text><Text>{fmtNum(netBeforeDiscount)}</Text></View>
                  <View style={s.totRow}><Text style={{ color: LABEL }}>Descuento</Text><Text>{discountNet > 0 ? `- ${fmtNum(discountNet)}` : fmtNum(0)}</Text></View>
                  <View style={s.totRow}><Text style={{ color: LABEL }}>Subtotal</Text><Text>{fmtNum(invoice.subtotal)}</Text></View>
                  {[...ivaByRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, amount]) => (
                    <View key={rate} style={s.totRow}>
                      <Text style={{ color: LABEL }}>IVA {rate.toLocaleString('es-AR')}%</Text>
                      <Text>{fmtNum(amount)}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <>
                  <View style={s.totRow}><Text style={{ color: LABEL }}>Subtotal</Text><Text>{fmtNum(grossBeforeDiscount)}</Text></View>
                  <View style={s.totRow}><Text style={{ color: LABEL }}>Descuento</Text><Text>{discountGross > 0 ? `- ${fmtNum(discountGross)}` : fmtNum(0)}</Text></View>
                </>
              )}
              <View style={ps.totalLine}>
                <Text style={{ fontWeight: 600, fontSize: 9.75 }}>TOTAL</Text>
                <Text style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtMoney(invoice.total, currency)}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingTop: 4.5, paddingHorizontal: 3 }}>
            <Text style={{ flex: 1, fontSize: 8.25, color: SOFT, paddingRight: 12 }}>
              Son {currency === 'USD' ? 'dólares' : 'pesos'}: {amountToWords(invoice.total, currency)}.
            </Text>
            {transparency.applies && (
              <View style={{ width: 198, borderWidth: 0.75, borderColor: INK, padding: 4.5 }}>
                <Text style={{ fontSize: 7.5, fontWeight: 600 }}>{FISCAL_TRANSPARENCY_LEGEND}</Text>
                {transparency.showAmount && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 8.25, fontWeight: 600 }}>IVA contenido</Text>
                    <Text style={{ fontSize: 8.25, fontWeight: 600 }}>{fmtMoney(transparency.ivaContenido, currency)}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}
