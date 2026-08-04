import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PurchaseInvoiceRetentionRow } from '../../types/purchase.types';
import type { AfipConfigSummary } from '../../types/afip.types';

// ─── Colors ────────────────────────────────────────────────────────────────
const INDIGO = '#3730a3';
const LIGHT_BG = '#eef2ff';
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

  header: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 90,
  },
  headerLeft: { flex: 5, padding: 10, borderRightWidth: 1, borderRightColor: BORDER, justifyContent: 'center' },
  headerCenter: {
    width: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: 10,
    borderRightWidth: 1, borderRightColor: BORDER, backgroundColor: LIGHT_BG,
  },
  headerRight: { flex: 5, padding: 10, justifyContent: 'center' },

  companyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 2 },
  labelGray: { fontSize: 7, color: GRAY, marginRight: 3 },
  valueText: { fontSize: 7.5, color: DARK },

  docTypeBox: {
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 2, borderColor: INDIGO,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  docTypeText: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: INDIGO, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  docTypeSubtext: { fontSize: 6, color: INDIGO, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },

  docTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  docNumber: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: INDIGO, letterSpacing: 1, marginBottom: 8 },

  section: { borderWidth: 1, borderTopWidth: 0, borderColor: BORDER, padding: 10 },
  sectionTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  fieldRow: { flexDirection: 'row', marginBottom: 3, flexWrap: 'wrap' },
  field: { width: '50%', flexDirection: 'row' },
  fieldFull: { width: '100%', flexDirection: 'row' },

  table: { marginTop: 14, borderWidth: 1, borderColor: BORDER },
  tableHeader: { flexDirection: 'row', backgroundColor: INDIGO, paddingVertical: 5, paddingHorizontal: 6 },
  thCell: { color: WHITE, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 0.5, borderTopColor: BORDER },
  tdCell: { fontSize: 7.5, color: DARK },
  colType: { flex: 2 },
  colBase: { flex: 2, textAlign: 'right' },
  colPct: { flex: 1, textAlign: 'right' },
  colAmount: { flex: 2, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: LIGHT_BG,
  },
  totalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginRight: 8 },
  totalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: INDIGO },

  notes: { marginTop: 12, padding: 8, borderWidth: 0.5, borderColor: BORDER, backgroundColor: '#fafafa' },
  notesText: { fontSize: 7, color: GRAY },

  footer: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  signatureBox: { width: '40%', borderTopWidth: 0.5, borderTopColor: DARK, paddingTop: 4, alignItems: 'center' },
  signatureLabel: { fontSize: 7, color: GRAY },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function fmtMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const RETENTION_TYPE_LABELS: Record<string, string> = {
  IIBB: 'Ingresos Brutos',
  GANANCIAS: 'Impuesto a las Ganancias',
  IVA: 'IVA',
  OTHER: 'Otro',
};

// ─── Component ─────────────────────────────────────────────────────────────

interface RetentionCertificatePDFProps {
  retention: PurchaseInvoiceRetentionRow;
  afipConfig: AfipConfigSummary | null;
}

export default function RetentionCertificatePDF({ retention, afipConfig }: RetentionCertificatePDFProps) {
  const issuerName = afipConfig?.businessName ?? '';
  const issuerAddress = afipConfig?.businessAddress ?? '';
  const issuerCuit = afipConfig?.cuit ? fmtCuit(afipConfig.cuit) : '';
  const typeLabel = RETENTION_TYPE_LABELS[retention.type] ?? retention.type;

  return (
    <Document title={`Retención ${retention.certificate ?? retention.id}`} author={issuerName || 'Cloud-Bill'}>
      <Page size="A4" style={s.page}>

        {/* ── HEADER ──────────────────────────────────────────── */}
        <View style={s.header}>
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
          </View>

          <View style={s.headerCenter}>
            <View style={s.docTypeBox}>
              <Text style={s.docTypeText}>Constancia de{'\n'}Retención</Text>
            </View>
            <Text style={s.docTypeSubtext}>Agente de retención</Text>
          </View>

          <View style={s.headerRight}>
            <Text style={s.docTitle}>Comprobante</Text>
            <Text style={s.docNumber}>{retention.certificate ?? '—'}</Text>
            <View style={s.row}>
              <Text style={s.labelGray}>Fecha:</Text>
              <Text style={s.valueText}>{fmtDate(retention.createdAt)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.labelGray}>Régimen:</Text>
              <Text style={s.valueText}>{typeLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── RETENIDO (proveedor) ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sujeto retenido</Text>
          <View style={s.fieldRow}>
            <View style={s.fieldFull}>
              <Text style={s.labelGray}>Razón social: </Text>
              <Text style={[s.valueText, { fontFamily: 'Helvetica-Bold' }]}>{retention.supplier.name}</Text>
            </View>
          </View>
          <View style={s.fieldRow}>
            {retention.supplier.cuit && (
              <View style={s.field}>
                <Text style={s.labelGray}>CUIT: </Text>
                <Text style={s.valueText}>{fmtCuit(retention.supplier.cuit)}</Text>
              </View>
            )}
            <View style={s.field}>
              <Text style={s.labelGray}>Orden de pago: </Text>
              <Text style={s.valueText}>{retention.invoice.number} ({fmtDate(retention.invoice.date)})</Text>
            </View>
          </View>
          {retention.jurisdiction && (
            <View style={s.fieldRow}>
              <View style={s.fieldFull}>
                <Text style={s.labelGray}>Jurisdicción: </Text>
                <Text style={s.valueText}>{retention.jurisdiction}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── DETALLE ──────────────────────────────────────────── */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.thCell, s.colType]}>Régimen</Text>
            <Text style={[s.thCell, s.colBase]}>Base imponible</Text>
            <Text style={[s.thCell, s.colPct]}>Alícuota</Text>
            <Text style={[s.thCell, s.colAmount]}>Importe retenido</Text>
          </View>
          <View style={s.tableRow}>
            <Text style={[s.tdCell, s.colType]}>{typeLabel}</Text>
            <Text style={[s.tdCell, s.colBase]}>{fmtMoney(retention.base, retention.invoice.currency)}</Text>
            <Text style={[s.tdCell, s.colPct]}>{retention.percentage}%</Text>
            <Text style={[s.tdCell, s.colAmount, { fontFamily: 'Helvetica-Bold' }]}>
              {fmtMoney(retention.amount, retention.invoice.currency)}
            </Text>
          </View>
        </View>

        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total retenido</Text>
          <Text style={s.totalValue}>{fmtMoney(retention.amount, retention.invoice.currency)}</Text>
        </View>

        {retention.notes && (
          <View style={s.notes}>
            <Text style={s.notesText}>{retention.notes}</Text>
          </View>
        )}

        {/* ── SIGNATURE FOOTER ─────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.signatureBox}>
            <Text style={s.signatureLabel}>Firma y aclaración agente de retención</Text>
          </View>
          <View style={s.signatureBox}>
            <Text style={s.signatureLabel}>Firma y aclaración sujeto retenido</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
