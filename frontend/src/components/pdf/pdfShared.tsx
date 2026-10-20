import { Text, View, Image } from '@react-pdf/renderer';
import type { IssuerInfo } from '../../utils/printContext';
import { ps, LABEL, INK } from './pdfFormat';

// Componentes comunes de los comprobantes A4 (estilos y formatos en pdfFormat.ts).

/**
 * Bloque izquierdo del encabezado: logo + razón social, domicilio y contacto.
 * Con `logoSlot` el logo ocupa siempre su espacio (vacío si la empresa no cargó
 * uno), como en los modelos de factura, recibo y orden de pago.
 */
export function IssuerBlock({
  issuer, hideWebsite = false, logoSlot = false,
}: { issuer: IssuerInfo; hideWebsite?: boolean; logoSlot?: boolean }) {
  return (
    <View>
      {logoSlot ? (
        <View style={ps.logoSlot}>
          {issuer.logoDataUrl ? <Image src={issuer.logoDataUrl} style={ps.logoInSlot} /> : null}
        </View>
      ) : issuer.logoDataUrl ? <Image src={issuer.logoDataUrl} style={ps.logo} /> : null}
      {issuer.name ? <Text style={ps.issuerName}>{issuer.name}</Text> : null}
      {issuer.address ? <Text style={[ps.issuerLine, { marginTop: 3 }]}>{issuer.address}</Text> : null}
      {issuer.phone ? <Text style={ps.issuerLine}>Tel. {issuer.phone}</Text> : null}
      {issuer.email ? <Text style={ps.issuerLine}>{issuer.email}</Text> : null}
      {issuer.website && !hideWebsite ? <Text style={ps.issuerLine}>{issuer.website}</Text> : null}
    </View>
  );
}

/** Recuadro de la letra con su leyenda debajo y el filete vertical del modelo. */
export function LetterBox({ letter, caption, stem = true }: { letter: string; caption?: string; stem?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={ps.letterBox}>
        <Text style={ps.letter}>{letter}</Text>
      </View>
      {caption ? <Text style={ps.letterCaption}>{caption}</Text> : null}
      {stem ? <View style={ps.letterStem} /> : null}
    </View>
  );
}

/** Filas "etiqueta  valor" alineadas en dos columnas. Las de valor vacío se omiten. */
export function KV({
  rows, labelWidth = 84, valueStyle,
}: {
  rows: [string, string | null | undefined][];
  labelWidth?: number;
  valueStyle?: { fontWeight?: number; fontFamily?: string; fontSize?: number };
}) {
  return (
    <View>
      {rows.filter(([, v]) => v).map(([label, value]) => (
        <View key={label} style={ps.kv}>
          <Text style={{ width: labelWidth, color: LABEL }}>{label}</Text>
          <Text style={[{ flex: 1 }, valueStyle ?? {}]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Encabezado de tres columnas: emisor | letra | comprobante. Sin `letter`, la
 * columna central queda como un filete vertical (orden de pago).
 */
export function DocHeader({
  issuer, letter, letterCaption, centerWidth = 63, title, titleAside, number, date, rows, kicker, hideWebsite, stem = true,
  logoSlot = false,
}: {
  issuer: IssuerInfo;
  letter?: string;
  letterCaption?: string;
  centerWidth?: number;
  title: string;
  titleAside?: string;
  number: string;
  date?: { label: string; value: string };
  rows?: [string, string | null | undefined][];
  kicker?: string;
  hideWebsite?: boolean;
  /** Filete vertical bajo la letra (se apaga en el remito, que va dos veces por hoja). */
  stem?: boolean;
  /** Reserva el espacio del logo arriba del emisor (factura, recibo, orden de pago). */
  logoSlot?: boolean;
}) {
  return (
    <View style={ps.header}>
      <View style={[ps.headerSide, { paddingRight: 15 }]}>
        <IssuerBlock issuer={issuer} hideWebsite={hideWebsite} logoSlot={logoSlot} />
      </View>
      <View style={{ width: centerWidth, alignItems: 'center' }}>
        {letter
          ? <LetterBox letter={letter} caption={letterCaption} stem={stem} />
          : <View style={{ width: 1.1, height: 96, backgroundColor: INK }} />}
      </View>
      <View style={[ps.headerSide, { paddingLeft: 15 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={ps.docTitle}>{title}</Text>
          {titleAside ? <Text style={{ fontSize: 7.9, letterSpacing: 1.1, color: LABEL, marginBottom: 2 }}>{titleAside}</Text> : null}
        </View>
        <Text style={ps.docNumber}>Nº {number}</Text>
        {date ? (
          <Text style={{ fontSize: 9.75, marginTop: 1.5 }}>
            {date.label} <Text style={{ fontWeight: 600 }}>{date.value}</Text>
          </Text>
        ) : null}
        {rows && rows.length > 0 ? (
          <View style={{ marginTop: 7.5 }}>
            <KV rows={rows} />
          </View>
        ) : null}
        {kicker ? <Text style={ps.kicker}>{kicker}</Text> : null}
      </View>
    </View>
  );
}

/** "Lote L-231 vto 12/05/2027 (6) · Lote L-240 (4)" para una línea impresa; '' si no tiene lotes. */
export function lotText(
  lots: { productId: string; variantId: string | null; lotNumber: string; expiresAt: string | null; quantity: number }[] | undefined,
  productId: string | null | undefined,
  variantId?: string | null,
): string {
  if (!lots?.length || !productId) return '';
  return lots
    .filter((l) => l.productId === productId && (l.variantId ?? null) === (variantId ?? null))
    .map((l) => `Lote ${l.lotNumber}${l.expiresAt ? ` vto ${l.expiresAt.split('-').reverse().join('/')}` : ''} (${l.quantity.toLocaleString('es-AR')})`)
    .join(' · ');
}
