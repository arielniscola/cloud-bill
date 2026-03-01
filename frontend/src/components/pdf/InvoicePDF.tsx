import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Invoice } from '../../types/invoice.types';
import type { AfipConfigSummary } from '../../types/afip.types';

// ─── Colors ────────────────────────────────────────────────────────────────
const BLUE = '#1a3a6b';
const LIGHT_BG = '#f0f4f8';
const GRAY = '#666666';
const DARK = '#1a1a1a';
const BORDER = '#cccccc';
const WHITE = '#ffffff';

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: DARK,
    paddingHorizontal: 35,
    paddingVertical: 30,
    backgroundColor: WHITE,
  },

  // ── "ORIGINAL" stamp ──
  original: {
    position: 'absolute',
    top: 30,
    right: 35,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    borderWidth: 1,
    borderColor: BLUE,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 1,
  },

  // ── Header 3-column ──
  header: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 100,
  },
  headerLeft: {
    flex: 5,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    justifyContent: 'center',
  },
  headerCenter: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    backgroundColor: LIGHT_BG,
  },
  headerRight: {
    flex: 5,
    padding: 10,
    justifyContent: 'center',
  },

  // company
  companyName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', marginBottom: 2 },
  labelGray: { fontSize: 7, color: GRAY, marginRight: 3 },
  valueText: { fontSize: 7.5, color: DARK },

  // type letter box
  typeBox: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  typeLetter: {
    fontSize: 44,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    lineHeight: 1,
  },
  typeLabel: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // invoice ID (right)
  invoiceTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  invoiceNumber: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    letterSpacing: 1,
    marginBottom: 8,
  },

  // ── Customer section ──
  customerSection: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    padding: 8,
    backgroundColor: '#fafafa',
  },
  customerRow: { flexDirection: 'row', marginBottom: 3, flexWrap: 'wrap' },
  customerField: { width: '50%', flexDirection: 'row' },
  customerFieldFull: { width: '100%', flexDirection: 'row' },

  // ── Items table ──
  table: { marginTop: 14, borderWidth: 1, borderColor: BORDER },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  thCell: {
    color: WHITE,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
  },
  tableRowAlt: { backgroundColor: '#f8f9fb' },
  tdCell: { fontSize: 7.5, color: DARK },

  // column widths
  colDesc: { flex: 4 },
  colQty: { width: 38, textAlign: 'right' },
  colPrice: { width: 65, textAlign: 'right' },
  colTaxRate: { width: 35, textAlign: 'center' },
  colTaxAmt: { width: 60, textAlign: 'right' },
  colTotal: { width: 65, textAlign: 'right' },

  // ── Totals ──
  totalsWrapper: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 230 },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  totalsFirstRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  totalsLabel: { fontSize: 7.5, color: GRAY },
  totalsValue: { fontSize: 7.5, color: DARK },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: BLUE,
  },
  totalFinalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },
  totalFinalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },

  // ── Notes ──
  notes: {
    marginTop: 8,
    padding: 8,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: '#fafafa',
  },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, marginBottom: 2 },
  notesText: { fontSize: 7.5, color: DARK },

  // ── Footer (CAE + QR) ──
  footer: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_BG,
  },
  footerInfo: { flex: 1 },
  footerQr: { width: 80, alignItems: 'center' },
  caeTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  caeRow: { flexDirection: 'row', marginBottom: 3 },
  caeLabel: { fontSize: 7, color: GRAY, width: 75 },
  caeValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: DARK, flex: 1 },
  qrLabel: { fontSize: 6, color: GRAY, textAlign: 'center', marginTop: 3 },

  // ── Draft watermark ──
  draftWatermark: {
    position: 'absolute',
    top: 300,
    left: 80,
    fontSize: 80,
    fontFamily: 'Helvetica-Bold',
    color: '#e0e0e0',
    transform: 'rotate(-45deg)',
    opacity: 0.5,
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

const INVOICE_TYPE_LABELS: Record<string, string> = {
  FACTURA_A: 'Factura A',
  FACTURA_B: 'Factura B',
  FACTURA_C: 'Factura C',
  NOTA_CREDITO_A: 'Nota de Crédito A',
  NOTA_CREDITO_B: 'Nota de Crédito B',
  NOTA_CREDITO_C: 'Nota de Crédito C',
  NOTA_DEBITO_A: 'Nota de Débito A',
  NOTA_DEBITO_B: 'Nota de Débito B',
  NOTA_DEBITO_C: 'Nota de Débito C',
};

function getTypeLetter(type: string): string {
  return type.slice(-1); // last char: A, B or C
}

function getTypeShortName(type: string): string {
  if (type.startsWith('FACTURA')) return 'Factura';
  if (type.startsWith('NOTA_CREDITO')) return 'Nota de Crédito';
  if (type.startsWith('NOTA_DEBITO')) return 'Nota de Débito';
  return 'Comprobante';
}

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

function fmtCuit(cuit: string): string {
  const c = cuit.replace(/\D/g, '');
  if (c.length === 11) return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  return cuit;
}

function invoiceNumber(invoice: Invoice): string {
  if (invoice.afipPtVenta && invoice.afipCbtNum) {
    return `${String(invoice.afipPtVenta).padStart(4, '0')}-${String(invoice.afipCbtNum).padStart(8, '0')}`;
  }
  return invoice.number;
}

// ─── Component ─────────────────────────────────────────────────────────────

interface InvoicePDFProps {
  invoice: Invoice;
  afipConfig: AfipConfigSummary | null;
  qrCodeDataUrl?: string;
}

export default function InvoicePDF({ invoice, afipConfig, qrCodeDataUrl }: InvoicePDFProps) {
  const typeLetter = getTypeLetter(invoice.type);
  const typeShort = getTypeShortName(invoice.type);
  const isDraft = invoice.status === 'DRAFT';

  // IVA breakdown by rate
  const taxBreakdown = invoice.items.reduce<Record<number, { base: number; tax: number }>>(
    (acc, item) => {
      if (!acc[item.taxRate]) acc[item.taxRate] = { base: 0, tax: 0 };
      acc[item.taxRate].base += item.subtotal;
      acc[item.taxRate].tax += item.taxAmount;
      return acc;
    },
    {}
  );

  const issuerName = afipConfig?.businessName ?? '';
  const issuerAddress = afipConfig?.businessAddress ?? '';
  const issuerCuit = afipConfig?.cuit ? fmtCuit(afipConfig.cuit) : '';
  const issuerTaxCondition = afipConfig?.taxCondition ?? 'Responsable Inscripto';

  return (
    <Document
      title={`${INVOICE_TYPE_LABELS[invoice.type]} ${invoiceNumber(invoice)}`}
      author={issuerName || 'Cloud-Bill'}
    >
      <Page size="A4" style={s.page}>
        {/* Draft watermark */}
        {isDraft && <Text style={s.draftWatermark}>BORRADOR</Text>}

        {/* ORIGINAL stamp */}
        <Text style={s.original}>ORIGINAL</Text>

        {/* ── HEADER ──────────────────────────────────────────── */}
        <View style={s.header}>
          {/* Left: issuer */}
          <View style={s.headerLeft}>
            {issuerName ? (
              <Text style={s.companyName}>{issuerName}</Text>
            ) : null}
            {issuerAddress ? (
              <View style={s.row}>
                <Text style={s.labelGray}>Domicilio:</Text>
                <Text style={s.valueText}>{issuerAddress}</Text>
              </View>
            ) : null}
            {issuerCuit ? (
              <View style={s.row}>
                <Text style={s.labelGray}>CUIT:</Text>
                <Text style={s.valueText}>{issuerCuit}</Text>
              </View>
            ) : null}
            <View style={s.row}>
              <Text style={s.labelGray}>Condición frente al IVA:</Text>
              <Text style={s.valueText}>{issuerTaxCondition}</Text>
            </View>
          </View>

          {/* Center: type letter */}
          <View style={s.headerCenter}>
            <Text style={[s.typeLabel, { marginBottom: 4 }]}>{typeShort}</Text>
            <View style={s.typeBox}>
              <Text style={s.typeLetter}>{typeLetter}</Text>
            </View>
            <Text style={[s.typeLabel, { marginTop: 4 }]}>Cód. {typeLetter}</Text>
          </View>

          {/* Right: invoice info */}
          <View style={s.headerRight}>
            <Text style={s.invoiceTitle}>Comprobante</Text>
            <Text style={s.invoiceNumber}>{invoiceNumber(invoice)}</Text>
            <View style={s.row}>
              <Text style={s.labelGray}>Fecha de emisión:</Text>
              <Text style={s.valueText}>{fmtDate(invoice.date)}</Text>
            </View>
            {invoice.dueDate && (
              <View style={s.row}>
                <Text style={s.labelGray}>Fecha de vencimiento:</Text>
                <Text style={s.valueText}>{fmtDate(invoice.dueDate)}</Text>
              </View>
            )}
            {invoice.currency === 'USD' && (
              <View style={s.row}>
                <Text style={s.labelGray}>Moneda:</Text>
                <Text style={s.valueText}>
                  USD (TC: {invoice.exchangeRate})
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── CUSTOMER ─────────────────────────────────────────── */}
        <View style={s.customerSection}>
          <View style={s.customerRow}>
            <View style={s.customerFieldFull}>
              <Text style={s.labelGray}>Razón Social / Nombre: </Text>
              <Text style={[s.valueText, { fontFamily: 'Helvetica-Bold' }]}>
                {invoice.customer?.name ?? ''}
              </Text>
            </View>
          </View>
          <View style={s.customerRow}>
            {invoice.customer?.taxId && (
              <View style={s.customerField}>
                <Text style={s.labelGray}>CUIT: </Text>
                <Text style={s.valueText}>{fmtCuit(invoice.customer.taxId)}</Text>
              </View>
            )}
            {invoice.customer?.taxCondition && (
              <View style={s.customerField}>
                <Text style={s.labelGray}>Condición IVA: </Text>
                <Text style={s.valueText}>
                  {invoice.customer.taxCondition.replace(/_/g, ' ')}
                </Text>
              </View>
            )}
          </View>
          {(invoice.customer?.address || invoice.customer?.city) && (
            <View style={s.customerRow}>
              <View style={s.customerFieldFull}>
                <Text style={s.labelGray}>Domicilio: </Text>
                <Text style={s.valueText}>
                  {[invoice.customer.address, invoice.customer.city, invoice.customer.province]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── ITEMS TABLE ──────────────────────────────────────── */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.thCell, s.colDesc]}>Descripción</Text>
            <Text style={[s.thCell, s.colQty]}>Cant.</Text>
            <Text style={[s.thCell, s.colPrice]}>Precio Unit.</Text>
            <Text style={[s.thCell, s.colTaxRate]}>IVA %</Text>
            <Text style={[s.thCell, s.colTaxAmt]}>IVA $</Text>
            <Text style={[s.thCell, s.colTotal]}>Total</Text>
          </View>

          {invoice.items.map((item, idx) => (
            <View key={item.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tdCell, s.colDesc]}>
                {item.product?.name ?? 'Producto'}
                {item.product?.sku ? ` (${item.product.sku})` : ''}
              </Text>
              <Text style={[s.tdCell, s.colQty]}>{item.quantity}</Text>
              <Text style={[s.tdCell, s.colPrice]}>
                {fmtCurrency(item.unitPrice, invoice.currency)}
              </Text>
              <Text style={[s.tdCell, s.colTaxRate]}>{item.taxRate}%</Text>
              <Text style={[s.tdCell, s.colTaxAmt]}>
                {fmtCurrency(item.taxAmount, invoice.currency)}
              </Text>
              <Text style={[s.tdCell, s.colTotal]}>
                {fmtCurrency(item.total, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── TOTALS ───────────────────────────────────────────── */}
        <View style={s.totalsWrapper}>
          <View style={s.totalsBox}>
            {/* Neto gravado by rate */}
            {Object.entries(taxBreakdown).map(([rate, { base, tax }], i) => (
              <View key={rate} style={[s.totalsRow, i === 0 ? s.totalsFirstRow : {}]}>
                <Text style={s.totalsLabel}>Neto gravado ({rate}%)</Text>
                <Text style={s.totalsValue}>{fmtCurrency(base, invoice.currency)}</Text>
              </View>
            ))}

            {/* IVA by rate */}
            {Object.entries(taxBreakdown).map(([rate, { tax }]) => (
              <View key={`iva-${rate}`} style={s.totalsRow}>
                <Text style={s.totalsLabel}>IVA {rate}%</Text>
                <Text style={s.totalsValue}>{fmtCurrency(tax, invoice.currency)}</Text>
              </View>
            ))}

            {/* Subtotal */}
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsValue}>{fmtCurrency(invoice.subtotal, invoice.currency)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Total IVA</Text>
              <Text style={s.totalsValue}>{fmtCurrency(invoice.taxAmount, invoice.currency)}</Text>
            </View>

            {/* TOTAL */}
            <View style={s.totalFinalRow}>
              <Text style={s.totalFinalLabel}>TOTAL</Text>
              <Text style={s.totalFinalValue}>
                {fmtCurrency(invoice.total, invoice.currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── NOTES ────────────────────────────────────────────── */}
        {invoice.notes && (
          <View style={s.notes}>
            <Text style={s.notesLabel}>Observaciones</Text>
            <Text style={s.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── FOOTER: CAE + QR ─────────────────────────────────── */}
        {invoice.cae && (
          <View style={s.footer}>
            <View style={s.footerInfo}>
              <Text style={s.caeTitle}>Comprobante Autorizado por ARCA</Text>
              <View style={s.caeRow}>
                <Text style={s.caeLabel}>CAE N°:</Text>
                <Text style={s.caeValue}>{invoice.cae}</Text>
              </View>
              {invoice.caeExpiry && (
                <View style={s.caeRow}>
                  <Text style={s.caeLabel}>Fecha de Vto. CAE:</Text>
                  <Text style={s.caeValue}>{fmtDate(invoice.caeExpiry)}</Text>
                </View>
              )}
              {invoice.afipPtVenta && (
                <View style={s.caeRow}>
                  <Text style={s.caeLabel}>Punto de Venta:</Text>
                  <Text style={s.caeValue}>
                    {String(invoice.afipPtVenta).padStart(4, '0')}
                  </Text>
                </View>
              )}
            </View>

            {qrCodeDataUrl && (
              <View style={s.footerQr}>
                <Image src={qrCodeDataUrl} style={{ width: 70, height: 70 }} />
                <Text style={s.qrLabel}>Verificar en ARCA</Text>
              </View>
            )}
          </View>
        )}

        {/* No CAE notice */}
        {!invoice.cae && !isDraft && (
          <View style={[s.footer, { backgroundColor: '#fff8e1' }]}>
            <Text style={{ fontSize: 7.5, color: '#8a6d00' }}>
              Este comprobante no fue autorizado por ARCA (sin CAE). No tiene validez fiscal.
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
