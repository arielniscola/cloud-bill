import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Remito } from '../../types/remito.types';
import type { AfipConfigSummary } from '../../types/afip.types';

// ─── Colors ────────────────────────────────────────────────────────────────
const ORANGE = '#7c3a00';
const LIGHT_BG = '#fdf5ef';
const GRAY = '#666666';
const DARK = '#1a1a1a';
const BORDER = '#cccccc';
const WHITE = '#ffffff';
const GREEN = '#166534';
const AMBER = '#92400e';

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
    minHeight: 90,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  docTypeText: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: ORANGE,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  docTypeSubtext: {
    fontSize: 6,
    color: ORANGE,
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
    color: ORANGE,
    letterSpacing: 1,
    marginBottom: 8,
  },

  // ── Customer section ──
  customerSection: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    padding: 8,
    backgroundColor: '#fffaf6',
  },
  customerRow: { flexDirection: 'row', marginBottom: 3, flexWrap: 'wrap' },
  customerField: { width: '50%', flexDirection: 'row' },
  customerFieldFull: { width: '100%', flexDirection: 'row' },

  // ── Source doc banner ──
  sourceBanner: {
    marginTop: 8,
    padding: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 0.5,
    borderColor: '#bfdbfe',
    flexDirection: 'row',
  },
  sourceBannerLabel: { fontSize: 7.5, color: '#1d4ed8' },
  sourceBannerValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#1d4ed8' },

  // ── Items table ──
  table: { marginTop: 14, borderWidth: 1, borderColor: BORDER },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: ORANGE,
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
  tableRowAlt: { backgroundColor: '#fdf8f5' },
  tdCell: { fontSize: 7.5, color: DARK },

  // column widths
  colDesc: { flex: 4 },
  colQty: { width: 55, textAlign: 'right' },
  colDelivered: { width: 55, textAlign: 'right' },
  colPending: { width: 55, textAlign: 'right' },

  // ── Notes ──
  notes: {
    marginTop: 8,
    padding: 8,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: '#fffaf6',
  },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, marginBottom: 2 },
  notesText: { fontSize: 7.5, color: DARK },

  // ── Footer signature ──
  footer: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBox: {
    width: '40%',
    borderTopWidth: 0.5,
    borderTopColor: DARK,
    paddingTop: 4,
    alignItems: 'center',
  },
  signatureLabel: { fontSize: 7, color: GRAY },

  // ── Status badge ──
  statusBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderRadius: 4,
  },
  statusText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
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

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIALLY_DELIVERED: 'Entrega parcial',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const BEHAVIOR_LABELS: Record<string, string> = {
  DISCOUNT: 'Entrega inmediata',
  RESERVE: 'Reserva con entrega posterior',
};

// ─── Component ─────────────────────────────────────────────────────────────

interface RemitoPDFProps {
  remito: Remito;
  afipConfig: AfipConfigSummary | null;
}

export default function RemitoPDF({ remito, afipConfig }: RemitoPDFProps) {
  const issuerName = afipConfig?.businessName ?? '';
  const issuerAddress = afipConfig?.businessAddress ?? '';
  const issuerCuit = afipConfig?.cuit ? fmtCuit(afipConfig.cuit) : '';

  const isCancelled = remito.status === 'CANCELLED';

  return (
    <Document title={`Remito ${remito.number}`} author={issuerName || 'Cloud-Bill'}>
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
          </View>

          {/* Center: REMITO badge */}
          <View style={s.headerCenter}>
            <View style={s.docTypeBox}>
              <Text style={s.docTypeText}>REMITO</Text>
            </View>
            <Text style={s.docTypeSubtext}>Comprobante de</Text>
            <Text style={s.docTypeSubtext}>entrega</Text>
          </View>

          {/* Right: remito info */}
          <View style={s.headerRight}>
            <Text style={s.docTitle}>Remito</Text>
            <Text style={s.docNumber}>{remito.number}</Text>
            <View style={s.row}>
              <Text style={s.labelGray}>Fecha:</Text>
              <Text style={s.valueText}>{fmtDate(remito.date)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.labelGray}>Modalidad:</Text>
              <Text style={s.valueText}>{BEHAVIOR_LABELS[remito.stockBehavior] ?? remito.stockBehavior}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.labelGray}>Estado:</Text>
              <Text style={[s.valueText, { fontFamily: 'Helvetica-Bold', color: isCancelled ? '#b91c1c' : ORANGE }]}>
                {STATUS_LABELS[remito.status] ?? remito.status}
              </Text>
            </View>
          </View>
        </View>

        {/* ── CUSTOMER ─────────────────────────────────────────── */}
        <View style={s.customerSection}>
          <View style={s.customerRow}>
            <View style={s.customerFieldFull}>
              <Text style={s.labelGray}>Señor(es): </Text>
              <Text style={[s.valueText, { fontFamily: 'Helvetica-Bold' }]}>
                {remito.customer?.name ?? '—'}
              </Text>
            </View>
          </View>
          {remito.customer && (
            <View style={s.customerRow}>
              {remito.customer.taxId && (
                <View style={s.customerField}>
                  <Text style={s.labelGray}>CUIT: </Text>
                  <Text style={s.valueText}>{fmtCuit(remito.customer.taxId)}</Text>
                </View>
              )}
              {remito.customer.address && (
                <View style={s.customerField}>
                  <Text style={s.labelGray}>Domicilio: </Text>
                  <Text style={s.valueText}>{remito.customer.address}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── SOURCE DOCUMENT BANNER ───────────────────────────── */}
        {(remito.invoiceId || remito.budgetId) && (
          <View style={s.sourceBanner}>
            <Text style={s.sourceBannerLabel}>
              {remito.invoiceId ? 'Factura asociada: ' : 'Presupuesto asociado: '}
            </Text>
            <Text style={s.sourceBannerValue}>
              {remito.invoiceId
                ? (remito.invoice?.number ?? remito.invoiceId)
                : (remito.budget?.number ?? remito.budgetId)}
            </Text>
          </View>
        )}

        {/* ── ITEMS TABLE ──────────────────────────────────────── */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.thCell, s.colDesc]}>Producto / Descripción</Text>
            <Text style={[s.thCell, s.colQty]}>Cantidad</Text>
            <Text style={[s.thCell, s.colDelivered]}>Entregado</Text>
            <Text style={[s.thCell, s.colPending]}>Pendiente</Text>
          </View>

          {remito.items.map((item, idx) => {
            const pending = Number(item.quantity) - Number(item.deliveredQuantity);
            return (
              <View key={item.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                <View style={s.colDesc}>
                  <Text style={s.tdCell}>
                    {item.product?.name ?? '—'}
                  </Text>
                  {item.product?.sku ? (
                    <Text style={[s.tdCell, { fontSize: 6.5, color: GRAY }]}>{item.product.sku}</Text>
                  ) : null}
                </View>
                <Text style={[s.tdCell, s.colQty]}>{Number(item.quantity)}</Text>
                <Text style={[s.tdCell, s.colDelivered, { color: GREEN, fontFamily: 'Helvetica-Bold' }]}>
                  {Number(item.deliveredQuantity)}
                </Text>
                <Text style={[s.tdCell, s.colPending, { color: pending > 0 ? AMBER : GREEN, fontFamily: pending > 0 ? 'Helvetica-Bold' : 'Helvetica' }]}>
                  {pending}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── NOTES ────────────────────────────────────────────── */}
        {remito.notes && (
          <View style={s.notes}>
            <Text style={s.notesLabel}>Observaciones</Text>
            <Text style={s.notesText}>{remito.notes}</Text>
          </View>
        )}

        {/* ── SIGNATURE FOOTER ─────────────────────────────────── */}
        {!isCancelled && (
          <View style={s.footer}>
            <View style={s.signatureBox}>
              <Text style={s.signatureLabel}>Firma y aclaración emisor</Text>
            </View>
            <View style={s.signatureBox}>
              <Text style={s.signatureLabel}>Firma y aclaración receptor</Text>
            </View>
          </View>
        )}

      </Page>
    </Document>
  );
}
