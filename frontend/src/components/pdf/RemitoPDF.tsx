import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Remito } from '../../types/remito.types';
import type { PrintContext } from '../../utils/printContext';
import { afipInvoiceNumber, invoiceLetter, invoiceTypeName } from '../../utils/afipFiscal';
import type { InvoiceType } from '../../types/invoice.types';
import { DocHeader, KV } from './pdfShared';
import {
  ps, INK, LABEL, SOFT, fmtDate, fmtCuit, fmtQty, taxConditionTitle, saleConditionTitle, unitText,
} from './pdfFormat';

// Remito "R" (código ARCA 091), línea "Clásico refinado": datos fiscales del
// emisor, datos del cliente, código / descripción / unidad / cantidad y firma.
// Las copias salen según `ctx.remitoCopies`: original y duplicado en la misma
// hoja A4, una hoja por copia, o una sola copia. Si la empresa cargó el CAI del
// talonario de remitos en la configuración, se imprime con su vencimiento.

const s = StyleSheet.create({
  page: { ...ps.page, paddingTop: 20, paddingBottom: 14 },
  copy: { height: '49%', position: 'relative' },
  copyFull: { height: '100%', position: 'relative' },
  cut: { borderTopWidth: 0.75, borderTopColor: '#9a9a9a', borderStyle: 'dashed', marginVertical: 6 },
  cCode: { width: 66 },
  cDesc: { flex: 1, paddingRight: 6 },
  cUnit: { width: 75 },
  cQty: { width: 60, textAlign: 'right' },
  sign: { position: 'absolute', right: 12, bottom: 8, width: 150, borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 3, alignItems: 'center' },
});

interface RemitoPDFProps {
  remito: Remito;
  ctx: PrintContext;
}

function Copy({ remito, ctx, label, full }: RemitoPDFProps & { label?: string; full?: boolean }) {
  const { issuer } = ctx;
  const c = remito.customer;
  const inv = remito.invoice;
  const saleCond = inv
    ? saleConditionTitle(inv.saleCondition, inv.paymentTerms)
    : saleConditionTitle(c?.saleCondition);
  const relatedInvoice = inv
    ? `${invoiceTypeName(inv.type as InvoiceType)} ${invoiceLetter(inv.type as InvoiceType)} ${afipInvoiceNumber({ number: inv.number, afipPtVenta: inv.afipPtVenta ?? null, afipCbtNum: inv.afipCbtNum ?? null })}`
    : '';
  // Las notas automáticas ("Auto-generado desde factura ...") no aportan al papel.
  const notes = remito.notes && !remito.notes.startsWith('Auto-generado') ? remito.notes : '';
  const qty = (q: number) => (Number.isInteger(Number(q)) ? String(Number(q)) : fmtQty(q));

  return (
    <View style={full ? s.copyFull : s.copy}>
      {remito.status === 'CANCELLED' && <Text style={[ps.watermark, { top: full ? 300 : 120, fontSize: 60 }]}>ANULADO</Text>}

      <DocHeader
        issuer={issuer}
        stem={false}
        letter="R"
        letterCaption="COD. 091"
        title="REMITO"
        titleAside={label}
        number={remito.number}
        rows={[
          ['Fecha', fmtDate(remito.date)],
          ['CUIT', fmtCuit(issuer.cuit)],
          ['Cond. IVA', issuer.taxCondition],
          ['IIBB', issuer.grossIncome],
          ['Inicio actividades', issuer.activityStart ? fmtDate(issuer.activityStart) : ''],
          ['Vendedor', remito.user?.name],
          ['CAI', ctx.remitoCai],
          ['Vto. CAI', ctx.remitoCai && ctx.remitoCaiExpiry ? fmtDate(ctx.remitoCaiExpiry) : ''],
        ]}
      />
      <View style={[ps.accentRule, { marginTop: 7 }]} />

      <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: INK }}>
        <View style={{ flex: 1.2, paddingRight: 18 }}>
          <View style={ps.kv}>
            <Text style={{ width: 55, color: LABEL }}>Cliente</Text>
            <Text style={{ flex: 1, fontWeight: 600 }}>{c?.name ?? '-'}</Text>
          </View>
          <KV
            labelWidth={55}
            rows={[
              ['Domicilio', [c?.address, c?.city].filter(Boolean).join(', ') || '-'],
              ['Teléfono', c?.phone || '-'],
              ['Cond. venta', saleCond],
            ]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <KV
            labelWidth={68}
            rows={[
              ['CUIT / DNI', fmtCuit(c?.taxId) || '-'],
              ['Cond. IVA', taxConditionTitle(c?.taxCondition) || '-'],
              ['Ing. Brutos', c?.grossIncome || '-'],
              ['Factura', relatedInvoice],
            ]}
          />
        </View>
      </View>

      <View style={[ps.tableHead, { marginTop: 8 }]}>
        <Text style={[ps.th, s.cCode]}>Código</Text>
        <Text style={[ps.th, s.cDesc]}>Descripción</Text>
        <Text style={[ps.th, s.cUnit]}>Unidad</Text>
        <Text style={[ps.th, s.cQty]}>Cantidad</Text>
      </View>
      {remito.items.map((item) => (
        <View key={item.id} style={[ps.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[ps.mono, s.cCode]}>{item.variant?.sku || item.product?.sku || ''}</Text>
          <Text style={s.cDesc}>
            {(item.product?.name ?? '-').toUpperCase()}
            {item.variant?.name ? ` - ${item.variant.name.toUpperCase()}` : ''}
          </Text>
          <Text style={s.cUnit}>{unitText((item.product as { unit?: string } | undefined)?.unit)}</Text>
          <Text style={[s.cQty, { fontWeight: 600 }]}>{qty(item.quantity)}</Text>
        </View>
      ))}

      {(remito.transport || notes) ? (
        <View style={{ marginTop: 6, paddingHorizontal: 3 }}>
          {remito.transport ? <Text><Text style={{ color: LABEL }}>Transporte </Text>{remito.transport}</Text> : null}
          {notes ? <Text style={{ marginTop: 1.5 }}><Text style={{ color: LABEL }}>Observaciones </Text>{notes}</Text> : null}
        </View>
      ) : null}

      <View style={s.sign}>
        <Text style={{ color: SOFT }}>Recibí conforme · firma y aclaración</Text>
      </View>
    </View>
  );
}

export default function RemitoPDF({ remito, ctx }: RemitoPDFProps) {
  const copies = ctx.remitoCopies;
  return (
    <Document title={`Remito ${remito.number}`} author={ctx.issuer.name || 'Cloud-Bill'}>
      {copies === 'SINGLE' ? (
        <Page size="A4" style={s.page}>
          <Copy remito={remito} ctx={ctx} full />
        </Page>
      ) : copies === 'ONE_PER_PAGE' ? (
        ['ORIGINAL', 'DUPLICADO'].map((label) => (
          <Page key={label} size="A4" style={s.page}>
            <Copy remito={remito} ctx={ctx} label={label} full />
          </Page>
        ))
      ) : (
        <Page size="A4" style={s.page}>
          <Copy remito={remito} ctx={ctx} label="ORIGINAL" />
          <View style={s.cut} />
          <Copy remito={remito} ctx={ctx} label="DUPLICADO" />
        </Page>
      )}
    </Document>
  );
}
