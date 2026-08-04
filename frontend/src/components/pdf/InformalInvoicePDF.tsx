import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Invoice } from '../../types/invoice.types';
import type { AfipConfigSummary } from '../../types/afip.types';

// Comprobante NO fiscal (fiscalMode = INFORMAL): nunca tiene CAE, así que no
// lleva QR/AFIP. Formato reducido — sin desglose de IVA ni datos impositivos
// del cliente — y con una estética bien distinta (ámbar) de la factura
// oficial (azul) para que no se confundan a simple vista. Imprime el mismo
// comprobante dos veces en una hoja A4 (mitad superior / mitad inferior,
// separadas por una línea de corte) para ahorrar papel — reemplaza al viejo
// circuito de original/duplicado en hojas separadas.

// ─── Colors ────────────────────────────────────────────────────────────────
const AMBER = '#9a3412';
const LIGHT_BG = '#fff7ed';
const GRAY = '#666666';
const DARK = '#1a1a1a';
const BORDER = '#d6d3d1';
const WHITE = '#ffffff';

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: DARK,
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: WHITE,
  },

  slip: {
    height: '48%',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER,
    padding: 10,
  },

  cutLine: {
    height: '4%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutLineText: { fontSize: 7, color: GRAY, letterSpacing: 1 },

  badge: {
    alignSelf: 'flex-start',
    backgroundColor: AMBER,
    color: WHITE,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 6,
    paddingVertical: 3,
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  companyName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  smallGray: { fontSize: 7, color: GRAY },
  docNumber: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: AMBER, textAlign: 'right' },
  docDate: { fontSize: 7.5, color: DARK, textAlign: 'right', marginTop: 2 },

  customerRow: { flexDirection: 'row', marginBottom: 6, paddingVertical: 4, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER },
  customerLabel: { fontSize: 7, color: GRAY, marginRight: 3 },
  customerValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  table: { marginBottom: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: LIGHT_BG, paddingVertical: 3, paddingHorizontal: 3 },
  thCell: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: AMBER, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 3, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tdCell: { fontSize: 7.5, color: DARK },
  colDesc: { flex: 4 },
  colQty: { width: 30, textAlign: 'right' },
  colPrice: { width: 55, textAlign: 'right' },
  colTotal: { width: 60, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: AMBER,
  },
  totalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: 0.5 },
  totalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: WHITE },

  notes: { fontSize: 7, color: GRAY, marginTop: 4 },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtCurrency(value: number, currency: string = 'ARS'): string {
  const sym = currency === 'USD' ? 'USD ' : '$ ';
  return `${sym}${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function docLabel(type: string): string {
  if (type.startsWith('NOTA_CREDITO')) return 'Nota de Crédito interna';
  if (type.startsWith('NOTA_DEBITO')) return 'Nota de Débito interna';
  return 'Comprobante interno';
}

// ─── Component ─────────────────────────────────────────────────────────────

interface InformalInvoicePDFProps {
  invoice: Invoice;
  afipConfig: AfipConfigSummary | null;
}

function Slip({ invoice, afipConfig }: InformalInvoicePDFProps) {
  const issuerName = afipConfig?.businessName ?? '';
  const issuerAddress = afipConfig?.businessAddress ?? '';

  return (
    <View style={s.slip}>
      <Text style={s.badge}>COMPROBANTE INTERNO — SIN VALIDEZ FISCAL</Text>

      <View style={s.headerRow}>
        <View>
          {issuerName ? <Text style={s.companyName}>{issuerName}</Text> : null}
          {issuerAddress ? <Text style={s.smallGray}>{issuerAddress}</Text> : null}
        </View>
        <View>
          <Text style={s.docNumber}>{docLabel(invoice.type)} {invoice.number}</Text>
          <Text style={s.docDate}>Fecha: {fmtDate(invoice.date)}</Text>
        </View>
      </View>

      <View style={s.customerRow}>
        <Text style={s.customerLabel}>Cliente:</Text>
        <Text style={s.customerValue}>{invoice.customer?.name ?? 'Consumidor final'}</Text>
      </View>

      <View style={s.table}>
        <View style={s.tableHeader}>
          <Text style={[s.thCell, s.colDesc]}>Descripción</Text>
          <Text style={[s.thCell, s.colQty]}>Cant.</Text>
          <Text style={[s.thCell, s.colPrice]}>P. Unit.</Text>
          <Text style={[s.thCell, s.colTotal]}>Total</Text>
        </View>
        {invoice.items.map((item) => (
          <View key={item.id} style={s.tableRow}>
            <Text style={[s.tdCell, s.colDesc]}>{item.product?.name ?? 'Producto'}</Text>
            <Text style={[s.tdCell, s.colQty]}>{item.quantity}</Text>
            <Text style={[s.tdCell, s.colPrice]}>{fmtCurrency(item.unitPrice, invoice.currency)}</Text>
            <Text style={[s.tdCell, s.colTotal]}>{fmtCurrency(item.total, invoice.currency)}</Text>
          </View>
        ))}
      </View>

      <View style={s.totalRow}>
        <Text style={s.totalLabel}>TOTAL</Text>
        <Text style={s.totalValue}>{fmtCurrency(invoice.total, invoice.currency)}</Text>
      </View>

      {invoice.notes && <Text style={s.notes}>{invoice.notes}</Text>}
    </View>
  );
}

export default function InformalInvoicePDF({ invoice, afipConfig }: InformalInvoicePDFProps) {
  return (
    <Document title={`Comprobante interno ${invoice.number}`} author={afipConfig?.businessName || 'Cloud-Bill'}>
      <Page size="A4" style={s.page}>
        <Slip invoice={invoice} afipConfig={afipConfig} />
        <View style={s.cutLine}>
          <Text style={s.cutLineText}>✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</Text>
        </View>
        <Slip invoice={invoice} afipConfig={afipConfig} />
      </Page>
    </Document>
  );
}
