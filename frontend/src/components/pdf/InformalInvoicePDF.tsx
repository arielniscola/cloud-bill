import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Invoice } from '../../types/invoice.types';
import { KV } from './pdfShared';
import {
  ps, INK, LABEL, fmtMoney, fmtNum, fmtQty, fmtDate, fmtCuit, fmtCode, taxConditionShort, saleConditionTitle,
} from './pdfFormat';

// Comprobante NO fiscal (fiscalMode = INFORMAL), según el modelo "FAC NN" y con
// la línea "Clásico refinado": se titula PRESUPUESTO, no lleva datos del emisor
// ni CAE/IVA, y se imprime dos veces en la misma hoja A4 para cortar. Si la
// empresa tiene logo, va arriba a la izquierda (más chico: son dos por hoja).

const s = StyleSheet.create({
  page: { ...ps.page, paddingTop: 22, paddingBottom: 16 },
  slip: { height: '48.5%' },
  cut: { borderTopWidth: 0.75, borderTopColor: '#9a9a9a', borderStyle: 'dashed', marginVertical: 8 },
  cCode: { width: 66 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 42, textAlign: 'right' },
  cPrice: { width: 75, textAlign: 'right' },
  cTotal: { width: 80, textAlign: 'right' },
  logo: { maxWidth: 130, maxHeight: 42, objectFit: 'contain', marginRight: 12 },
});

/** Unitario a precio final: total de la línea / cantidad (incluye IVA y bonificación). */
function finalUnitPrice(total: number, quantity: number): number {
  const q = Number(quantity) || 0;
  return q ? Number(total) / q : 0;
}

function Slip({ invoice, logoDataUrl }: { invoice: Invoice; logoDataUrl?: string | null }) {
  const c = invoice.customer;
  const currency = invoice.currency;
  const locality = [c?.city, c?.province].filter(Boolean).join(', ') + (c?.postalCode ? ` · CP ${c.postalCode}` : '');
  return (
    <View style={s.slip}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          {logoDataUrl ? <Image src={logoDataUrl} style={s.logo} /> : null}
          <View>
            <Text style={ps.docTitle}>PRESUPUESTO</Text>
            <Text style={ps.docNumber}>Nº {invoice.number}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 9.75 }}>Fecha <Text style={{ fontWeight: 600 }}>{fmtDate(invoice.date)}</Text></Text>
      </View>
      <View style={[ps.accentRule, { marginTop: 7 }]} />

      <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: INK }}>
        <View style={{ flex: 1.3, paddingRight: 18 }}>
          <View style={ps.kv}>
            <Text style={{ width: 55, color: LABEL }}>Señor/es</Text>
            <Text style={{ flex: 1 }}>
              <Text style={{ fontWeight: 600 }}>{c?.name ?? 'CONSUMIDOR FINAL'}</Text>
              {c?.code ? <Text style={{ fontFamily: 'PlexMono', fontSize: 8.25, color: LABEL }}>{`  · ${fmtCode(c.code)}`}</Text> : null}
            </Text>
          </View>
          <KV
            labelWidth={55}
            rows={[
              ['Domicilio', c?.address || '-'],
              ['Localidad', locality || '-'],
            ]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <KV
            labelWidth={62}
            rows={[
              ['CUIT', fmtCuit(c?.taxId) || '-'],
              ['Tipo IVA', taxConditionShort(c?.taxCondition) || 'CF'],
              ['Teléfono', c?.phone || '-'],
              ['Cond. venta', saleConditionTitle(invoice.saleCondition, invoice.paymentTerms)],
              ['Vendedor', invoice.user?.name],
            ]}
          />
        </View>
      </View>

      <View style={[ps.tableHead, { marginTop: 8 }]}>
        <Text style={[ps.th, s.cCode]}>Código</Text>
        <Text style={[ps.th, s.cDesc]}>Detalle</Text>
        <Text style={[ps.th, s.cQty]}>Cant.</Text>
        <Text style={[ps.th, s.cPrice]}>Unitario</Text>
        <Text style={[ps.th, s.cTotal]}>Total</Text>
      </View>
      {invoice.items.map((item) => (
        <View key={item.id} style={[ps.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[ps.mono, s.cCode]}>{item.variant?.sku || item.product?.sku || ''}</Text>
          <Text style={s.cDesc}>
            {(item.description || item.product?.name || 'Producto').toUpperCase()}
            {item.variant?.name ? ` - ${item.variant.name.toUpperCase()}` : ''}
          </Text>
          <Text style={s.cQty}>{fmtQty(item.quantity)}</Text>
          <Text style={s.cPrice}>{fmtNum(finalUnitPrice(item.total, item.quantity))}</Text>
          <Text style={s.cTotal}>{fmtNum(item.total)}</Text>
        </View>
      ))}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 9 }}>
        <View style={{ flex: 1, paddingHorizontal: 3, paddingRight: 18 }}>
          {invoice.transport ? <Text><Text style={{ color: LABEL }}>Transporte </Text>{invoice.transport}</Text> : null}
          {invoice.notes ? <Text style={{ marginTop: 1.5 }}><Text style={{ color: LABEL }}>Observaciones </Text>{invoice.notes}</Text> : null}
        </View>
        <View style={[ps.box, { width: 190, paddingVertical: 7, paddingHorizontal: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
          <Text style={{ fontWeight: 600, fontSize: 9.75 }}>TOTAL</Text>
          <Text style={{ fontWeight: 700, fontSize: 12.75 }}>{fmtMoney(invoice.total, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function InformalInvoicePDF({ invoice, logoDataUrl }: { invoice: Invoice; logoDataUrl?: string | null }) {
  return (
    <Document title={`Presupuesto ${invoice.number}`} author="Cloud-Bill">
      <Page size="A4" style={s.page}>
        <Slip invoice={invoice} logoDataUrl={logoDataUrl} />
        <View style={s.cut} />
        <Slip invoice={invoice} logoDataUrl={logoDataUrl} />
      </Page>
    </Document>
  );
}
