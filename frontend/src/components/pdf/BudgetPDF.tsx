import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Budget } from '../../types/budget.types';
import type { AfipConfigSummary } from '../../types/afip.types';

// ─── Colors ────────────────────────────────────────────────────────────────
const TEAL = '#0f5a4e';
const LIGHT_BG = '#f0f7f5';
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

  // ── Header ──
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
    width: 100,
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

  companyName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', marginBottom: 2 },
  labelGray: { fontSize: 7, color: GRAY, marginRight: 3 },
  valueText: { fontSize: 7.5, color: DARK },

  // center badge
  docTypeBox: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  docTypeText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  docTypeSubtext: {
    fontSize: 6,
    color: TEAL,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: 'center',
  },

  // right side
  docTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  docNumber: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    letterSpacing: 1,
    marginBottom: 8,
  },

  // ── Customer section ──
  customerSection: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    padding: 8,
    backgroundColor: '#fafffe',
  },
  customerRow: { flexDirection: 'row', marginBottom: 3, flexWrap: 'wrap' },
  customerField: { width: '50%', flexDirection: 'row' },
  customerFieldFull: { width: '100%', flexDirection: 'row' },

  // ── Items table ──
  table: { marginTop: 14, borderWidth: 1, borderColor: BORDER },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: TEAL,
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
  tableRowAlt: { backgroundColor: '#f5faf9' },
  tdCell: { fontSize: 7.5, color: DARK },

  // column widths (no taxAmount column — cleaner for quotes)
  colDesc: { flex: 4 },
  colQty: { width: 40, textAlign: 'right' },
  colPrice: { width: 70, textAlign: 'right' },
  colTaxRate: { width: 38, textAlign: 'center' },
  colTotal: { width: 70, textAlign: 'right' },

  // ── Totals ──
  totalsWrapper: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 220 },
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
  totalsFirstRow: { borderTopWidth: 1, borderTopColor: BORDER },
  totalsLabel: { fontSize: 7.5, color: GRAY },
  totalsValue: { fontSize: 7.5, color: DARK },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: TEAL,
  },
  totalFinalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },
  totalFinalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },

  // ── Notes ──
  notes: {
    marginTop: 8,
    padding: 8,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: '#fafffe',
  },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, marginBottom: 2 },
  notesText: { fontSize: 7.5, color: DARK },

  // ── Footer validity ──
  footer: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    backgroundColor: LIGHT_BG,
  },
  footerTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerText: { fontSize: 7.5, color: DARK },
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

function fmtCuit(cuit: string): string {
  const c = cuit.replace(/\D/g, '');
  if (c.length === 11) return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  return cuit;
}

// ─── Component ─────────────────────────────────────────────────────────────

interface BudgetPDFProps {
  budget: Budget;
  afipConfig: AfipConfigSummary | null;
}

export default function BudgetPDF({ budget, afipConfig }: BudgetPDFProps) {
  const issuerName = afipConfig?.businessName ?? '';
  const issuerAddress = afipConfig?.businessAddress ?? '';
  const issuerCuit = afipConfig?.cuit ? fmtCuit(afipConfig.cuit) : '';
  const issuerTaxCondition = afipConfig?.taxCondition ?? 'Responsable Inscripto';

  const taxBreakdown = budget.items.reduce<Record<number, { base: number; tax: number }>>(
    (acc, item) => {
      const rate = Number(item.taxRate);
      if (!acc[rate]) acc[rate] = { base: 0, tax: 0 };
      acc[rate].base += Number(item.subtotal);
      acc[rate].tax += Number(item.taxAmount);
      return acc;
    },
    {}
  );

  return (
    <Document title={`Presupuesto ${budget.number}`} author={issuerName || 'Cloud-Bill'}>
      <Page size="A4" style={s.page}>

        {/* ── HEADER ──────────────────────────────────────────── */}
        <View style={s.header}>
          {/* Left: issuer */}
          <View style={s.headerLeft}>
            {issuerName ? <Text style={s.companyName}>{issuerName}</Text> : null}
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

          {/* Center: doc type badge */}
          <View style={s.headerCenter}>
            <View style={s.docTypeBox}>
              <Text style={s.docTypeText}>PRESU-</Text>
              <Text style={s.docTypeText}>PUESTO</Text>
            </View>
            <Text style={s.docTypeSubtext}>No válido como</Text>
            <Text style={s.docTypeSubtext}>comprobante fiscal</Text>
          </View>

          {/* Right: budget info */}
          <View style={s.headerRight}>
            <Text style={s.docTitle}>Presupuesto</Text>
            <Text style={s.docNumber}>{budget.number}</Text>
            <View style={s.row}>
              <Text style={s.labelGray}>Fecha de emisión:</Text>
              <Text style={s.valueText}>{fmtDate(budget.date)}</Text>
            </View>
            {budget.validUntil && (
              <View style={s.row}>
                <Text style={s.labelGray}>Válido hasta:</Text>
                <Text style={s.valueText}>{fmtDate(budget.validUntil)}</Text>
              </View>
            )}
            {budget.paymentTerms && (
              <View style={s.row}>
                <Text style={s.labelGray}>Cond. de venta:</Text>
                <Text style={s.valueText}>{budget.paymentTerms}</Text>
              </View>
            )}
            {budget.currency === 'USD' && (
              <View style={s.row}>
                <Text style={s.labelGray}>Moneda:</Text>
                <Text style={s.valueText}>USD (TC: {Number(budget.exchangeRate)})</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── CUSTOMER ─────────────────────────────────────────── */}
        <View style={s.customerSection}>
          <View style={s.customerRow}>
            <View style={s.customerFieldFull}>
              <Text style={s.labelGray}>Señor(es): </Text>
              <Text style={[s.valueText, { fontFamily: 'Helvetica-Bold' }]}>
                {budget.customer?.name ?? 'Consumidor Final'}
              </Text>
            </View>
          </View>
          {budget.customer && (
            <View style={s.customerRow}>
              {budget.customer.taxId && (
                <View style={s.customerField}>
                  <Text style={s.labelGray}>CUIT: </Text>
                  <Text style={s.valueText}>{fmtCuit(budget.customer.taxId)}</Text>
                </View>
              )}
              {budget.customer.email && (
                <View style={s.customerField}>
                  <Text style={s.labelGray}>Email: </Text>
                  <Text style={s.valueText}>{budget.customer.email}</Text>
                </View>
              )}
              {budget.customer.address && (
                <View style={[s.customerRow, { marginTop: 2 }]}>
                  <View style={s.customerFieldFull}>
                    <Text style={s.labelGray}>Domicilio: </Text>
                    <Text style={s.valueText}>{budget.customer.address}</Text>
                  </View>
                </View>
              )}
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
            <Text style={[s.thCell, s.colTotal]}>Total</Text>
          </View>

          {budget.items.map((item, idx) => (
            <View key={item.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
              <View style={s.colDesc}>
                <Text style={s.tdCell}>{item.description}</Text>
                {item.product?.sku ? (
                  <Text style={[s.tdCell, { fontSize: 6.5, color: GRAY }]}>{item.product.sku}</Text>
                ) : null}
              </View>
              <Text style={[s.tdCell, s.colQty]}>{Number(item.quantity)}</Text>
              <Text style={[s.tdCell, s.colPrice]}>
                {fmtCurrency(Number(item.unitPrice), budget.currency)}
              </Text>
              <Text style={[s.tdCell, s.colTaxRate]}>{Number(item.taxRate)}%</Text>
              <Text style={[s.tdCell, s.colTotal]}>
                {fmtCurrency(Number(item.total), budget.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── TOTALS ───────────────────────────────────────────── */}
        <View style={s.totalsWrapper}>
          <View style={s.totalsBox}>
            {Object.entries(taxBreakdown).map(([rate, { base, tax }], i) => (
              <View key={rate} style={[s.totalsRow, i === 0 ? s.totalsFirstRow : {}]}>
                <Text style={s.totalsLabel}>Neto gravado ({rate}%)</Text>
                <Text style={s.totalsValue}>{fmtCurrency(base, budget.currency)}</Text>
              </View>
            ))}
            {Object.entries(taxBreakdown).map(([rate, { tax }]) => (
              <View key={`iva-${rate}`} style={s.totalsRow}>
                <Text style={s.totalsLabel}>IVA {rate}%</Text>
                <Text style={s.totalsValue}>{fmtCurrency(tax, budget.currency)}</Text>
              </View>
            ))}
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsValue}>{fmtCurrency(Number(budget.subtotal), budget.currency)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Total IVA</Text>
              <Text style={s.totalsValue}>{fmtCurrency(Number(budget.taxAmount), budget.currency)}</Text>
            </View>
            <View style={s.totalFinalRow}>
              <Text style={s.totalFinalLabel}>TOTAL</Text>
              <Text style={s.totalFinalValue}>{fmtCurrency(Number(budget.total), budget.currency)}</Text>
            </View>
          </View>
        </View>

        {/* ── NOTES ────────────────────────────────────────────── */}
        {budget.notes && (
          <View style={s.notes}>
            <Text style={s.notesLabel}>Observaciones</Text>
            <Text style={s.notesText}>{budget.notes}</Text>
          </View>
        )}

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerTitle}>Condiciones del presupuesto</Text>
          {budget.validUntil && (
            <Text style={s.footerText}>
              • Este presupuesto tiene validez hasta el {fmtDate(budget.validUntil)}.
            </Text>
          )}
          {budget.paymentTerms && (
            <Text style={[s.footerText, { marginTop: 2 }]}>
              • Condición de pago: {budget.paymentTerms}.
            </Text>
          )}
          <Text style={[s.footerText, { marginTop: 2, color: GRAY }]}>
            • Este documento es un presupuesto y no tiene validez como comprobante fiscal.
          </Text>
        </View>

      </Page>
    </Document>
  );
}
