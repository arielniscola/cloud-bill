import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CashMovement } from '../../types';
import type { PrintContext } from '../../utils/printContext';
import { amountToWords } from '../../utils/numberToWords';
import { CASH_CONCEPT_LABELS } from '../../utils/cashMovements';
import { DocHeader, KV } from './pdfShared';
import { ps, INK, LABEL, SOFT, fmtMoney, fmtCuit, todayText } from './pdfFormat';

// Comprobante interno de retiro / ingreso de caja, línea "Clásico refinado".
// Original y duplicado en la misma hoja A4: uno queda en la caja y el otro se
// lo lleva quien retira (o entrega) la plata. Firman los dos.

const s = StyleSheet.create({
  page: { ...ps.page, paddingTop: 20, paddingBottom: 14 },
  copy: { height: '49%', position: 'relative' },
  cut: { borderTopWidth: 0.75, borderTopColor: '#9a9a9a', borderStyle: 'dashed', marginVertical: 6 },
  signs: { position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
});

function dateTime(value: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}

function Copy({ movement, ctx, label }: { movement: CashMovement; ctx: PrintContext; label: string }) {
  const { issuer } = ctx;
  const isOut = movement.type === 'OUT';
  const amount = Number(movement.amount) || 0;
  const bank = movement.bankAccount
    ? [movement.bankAccount.bank, movement.bankAccount.name, movement.bankAccount.accountNumber].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={s.copy}>
      {movement.status === 'CANCELLED' && <Text style={[ps.watermark, { top: 120, fontSize: 60 }]}>ANULADO</Text>}

      <DocHeader
        issuer={issuer}
        hideWebsite
        stem={false}
        title={isOut ? 'RETIRO DE CAJA' : 'INGRESO A CAJA'}
        titleAside={label}
        number={movement.number}
        rows={[
          ['Fecha', dateTime(movement.createdAt)],
          ['Caja', movement.cashRegister?.name],
          ['CUIT', fmtCuit(issuer.cuit)],
          ['Registró', movement.user?.name],
        ]}
        kicker="Comprobante interno · no válido como factura"
      />
      <View style={[ps.accentRule, { marginTop: 7 }]} />

      <View style={{ paddingVertical: 9, paddingHorizontal: 3, borderBottomWidth: 0.75, borderBottomColor: INK }}>
        <KV
          labelWidth={78}
          rows={[
            ['Concepto', CASH_CONCEPT_LABELS[movement.concept] ?? movement.concept],
            [isOut ? 'Retirado por' : 'Entregado por', movement.personName || ''],
            ['Cuenta bancaria', bank],
            ['Observaciones', movement.notes || ''],
          ]}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
        <View style={[ps.box, { width: 225, paddingVertical: 8, paddingHorizontal: 10.5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
          <Text style={{ fontWeight: 600, fontSize: 9.75 }}>{isOut ? 'IMPORTE RETIRADO' : 'IMPORTE INGRESADO'}</Text>
          <Text style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtMoney(amount)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 8.25, color: SOFT, textAlign: 'right', paddingTop: 5, paddingHorizontal: 3 }}>
        Son pesos: {amountToWords(amount)}.
      </Text>

      <View style={s.signs}>
        <View style={ps.signLine}><Text style={{ color: SOFT }}>{isOut ? 'Entregó (caja)' : 'Entregó'}</Text></View>
        <View style={ps.signLine}><Text style={{ color: SOFT }}>{isOut ? 'Recibió · firma y aclaración' : 'Recibió (caja)'}</Text></View>
      </View>
      <Text style={{ position: 'absolute', left: 3, bottom: 0, fontSize: 6.75, color: LABEL }}>Impreso el {todayText()}</Text>
    </View>
  );
}

export default function CashMovementPDF({ movement, ctx }: { movement: CashMovement; ctx: PrintContext }) {
  const title = movement.type === 'OUT' ? 'Retiro de caja' : 'Ingreso a caja';
  return (
    <Document title={`${title} ${movement.number}`} author={ctx.issuer.name || 'Cloud-Bill'}>
      <Page size="A4" style={s.page}>
        <Copy movement={movement} ctx={ctx} label="ORIGINAL" />
        <View style={s.cut} />
        <Copy movement={movement} ctx={ctx} label="DUPLICADO" />
      </Page>
    </Document>
  );
}
