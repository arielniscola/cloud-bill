import nodemailer from 'nodemailer';
import prisma from '../database/prisma';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(value: number | string | { toString(): string }, decimals = 2): string {
  const n = typeof value === 'object' ? parseFloat(value.toString()) : Number(value);
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── HTML wrapper ───────────────────────────────────────────────────────────

function wrapHtml(title: string, body: string, companyName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f7; margin: 0; padding: 0; color: #222; }
  .wrapper { max-width: 640px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .header { background: #4f46e5; color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p  { margin: 4px 0 0; font-size: 13px; opacity: .85; }
  .body { padding: 28px 32px; }
  .meta { display: flex; flex-wrap: wrap; gap: 12px 32px; margin-bottom: 24px; }
  .meta-item label { display: block; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
  .meta-item span  { font-size: 14px; font-weight: 600; color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
  th { background: #f8f8fb; text-align: left; padding: 8px 10px; font-size: 11px; color: #666; text-transform: uppercase; border-bottom: 2px solid #eee; }
  td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .text-right { text-align: right; }
  .totals-row td { border-top: 2px solid #eee; font-weight: 600; }
  .total-final td { background: #f8f8fb; font-size: 15px; font-weight: 700; color: #4f46e5; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .footer { padding: 16px 32px; background: #f8f8fb; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }
  .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #92400e; margin-bottom: 20px; }
  .cae-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #166534; margin-bottom: 20px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${title}</h1>
    <p>${companyName}</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">Este correo fue generado automáticamente por ${companyName}. No responder a este mensaje.</div>
</div>
</body>
</html>`;
}

// ── Transporter factory ────────────────────────────────────────────────────

async function createTransporter() {
  const settings = await prisma.$queryRaw<any[]>`
    SELECT "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom", "smtpSecure"
    FROM "app_settings"
    WHERE "id" = 'default'
    LIMIT 1
  `;

  const s = settings[0];
  if (!s?.smtpHost || !s?.smtpUser || !s?.smtpPass) {
    throw new Error('SMTP no configurado. Completá la configuración en Ajustes → Empresa.');
  }

  return {
    transporter: nodemailer.createTransport({
      host:   s.smtpHost,
      port:   Number(s.smtpPort ?? 587),
      secure: Boolean(s.smtpSecure ?? false),
      auth:   { user: s.smtpUser, pass: s.smtpPass },
    }),
    from: s.smtpFrom || s.smtpUser,
  };
}

// ── Company name helper ────────────────────────────────────────────────────

async function getCompanyName(): Promise<string> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "razonSocial" FROM "afip_config" LIMIT 1
  `;
  return rows[0]?.razonSocial || 'Cloud Bill';
}

// ── Invoice email ──────────────────────────────────────────────────────────

export async function sendInvoiceEmail(invoiceId: string, to: string): Promise<void> {
  const { transporter, from } = await createTransporter();
  const companyName = await getCompanyName();

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      i.id, i.number, i.type, i.date, i."dueDate", i.subtotal, i."taxAmount", i.total,
      i.currency, i.status, i.notes, i."paymentTerms", i.cae, i."caeExpiry",
      c.name AS "customerName", c.email AS "customerEmail",
      c."taxId" AS "customerTaxId",
      json_agg(
        json_build_object(
          'description', COALESCE(p.name, ii.description),
          'quantity', ii.quantity,
          'unitPrice', ii."unitPrice",
          'taxRate', ii."taxRate",
          'subtotal', ii.subtotal,
          'taxAmount', ii."taxAmount",
          'total', ii.total
        ) ORDER BY ii.id
      ) AS items
    FROM invoices i
    LEFT JOIN customers c ON i."customerId" = c.id
    LEFT JOIN invoice_items ii ON ii."invoiceId" = i.id
    LEFT JOIN products p ON ii."productId" = p.id
    WHERE i.id = ${invoiceId}
    GROUP BY i.id, c.name, c.email, c."taxId"
  `;

  if (!rows.length) throw new Error('Factura no encontrada');
  const inv = rows[0];

  const TYPE_LABELS: Record<string, string> = {
    FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C',
    NC_A: 'Nota de Crédito A', NC_B: 'Nota de Crédito B', NC_C: 'Nota de Crédito C',
    ND_A: 'Nota de Débito A', ND_B: 'Nota de Débito B', ND_C: 'Nota de Débito C',
  };
  const typeLabel = TYPE_LABELS[inv.type] ?? inv.type;

  const itemsRows = (inv.items as any[]).map((it) => `
    <tr>
      <td>${it.description}</td>
      <td class="text-right">${fmt(it.quantity, 0)}</td>
      <td class="text-right">$ ${fmt(it.unitPrice)}</td>
      <td class="text-right">${fmt(Number(it.taxRate))}%</td>
      <td class="text-right">$ ${fmt(it.total)}</td>
    </tr>
  `).join('');

  const caeBlock = inv.cae ? `
    <div class="cae-box">
      <strong>CAE:</strong> ${inv.cae} &nbsp;|&nbsp;
      <strong>Venc.:</strong> ${fmtDate(inv.caeExpiry)}
    </div>
  ` : '';

  const notesBlock = inv.notes ? `<div class="note">${inv.notes}</div>` : '';

  const body = `
    <div class="meta">
      <div class="meta-item"><label>Número</label><span>${inv.number}</span></div>
      <div class="meta-item"><label>Tipo</label><span>${typeLabel}</span></div>
      <div class="meta-item"><label>Fecha</label><span>${fmtDate(inv.date)}</span></div>
      ${inv.dueDate ? `<div class="meta-item"><label>Vencimiento</label><span>${fmtDate(inv.dueDate)}</span></div>` : ''}
      <div class="meta-item"><label>Cliente</label><span>${inv.customerName ?? '—'}</span></div>
      ${inv.customerTaxId ? `<div class="meta-item"><label>CUIT</label><span>${inv.customerTaxId}</span></div>` : ''}
      ${inv.paymentTerms ? `<div class="meta-item"><label>Cond. de pago</label><span>${inv.paymentTerms}</span></div>` : ''}
      <div class="meta-item"><label>Moneda</label><span>${inv.currency}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="text-right">Cant.</th>
          <th class="text-right">Precio unit.</th>
          <th class="text-right">IVA</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="4" class="text-right">Subtotal</td>
          <td class="text-right">$ ${fmt(inv.subtotal)}</td>
        </tr>
        <tr>
          <td colspan="4" class="text-right">IVA</td>
          <td class="text-right">$ ${fmt(inv.taxAmount)}</td>
        </tr>
        <tr class="total-final">
          <td colspan="4" class="text-right">TOTAL</td>
          <td class="text-right">$ ${fmt(inv.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${caeBlock}
    ${notesBlock}
  `;

  await transporter.sendMail({
    from: `"${companyName}" <${from}>`,
    to,
    subject: `${typeLabel} ${inv.number} — ${companyName}`,
    html: wrapHtml(`${typeLabel} ${inv.number}`, body, companyName),
  });
}

// ── Budget email ───────────────────────────────────────────────────────────

export async function sendBudgetEmail(budgetId: string, to: string): Promise<void> {
  const { transporter, from } = await createTransporter();
  const companyName = await getCompanyName();

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      b.id, b.number, b.date, b."validUntil", b.subtotal, b."taxAmount", b.total,
      b.currency, b.status, b.notes, b."paymentTerms",
      c.name AS "customerName", c.email AS "customerEmail", c."taxId" AS "customerTaxId",
      json_agg(
        json_build_object(
          'description', bi.description,
          'quantity', bi.quantity,
          'unitPrice', bi."unitPrice",
          'taxRate', bi."taxRate",
          'total', bi.total
        ) ORDER BY bi.id
      ) AS items
    FROM budgets b
    LEFT JOIN customers c ON b."customerId" = c.id
    LEFT JOIN budget_items bi ON bi."budgetId" = b.id
    WHERE b.id = ${budgetId}
    GROUP BY b.id, c.name, c.email, c."taxId"
  `;

  if (!rows.length) throw new Error('Presupuesto no encontrado');
  const bud = rows[0];

  const itemsRows = (bud.items as any[]).map((it) => `
    <tr>
      <td>${it.description}</td>
      <td class="text-right">${fmt(it.quantity, 0)}</td>
      <td class="text-right">$ ${fmt(it.unitPrice)}</td>
      <td class="text-right">${fmt(Number(it.taxRate))}%</td>
      <td class="text-right">$ ${fmt(it.total)}</td>
    </tr>
  `).join('');

  const notesBlock = bud.notes ? `<div class="note">${bud.notes}</div>` : '';

  const body = `
    <div class="meta">
      <div class="meta-item"><label>Número</label><span>${bud.number}</span></div>
      <div class="meta-item"><label>Fecha</label><span>${fmtDate(bud.date)}</span></div>
      ${bud.validUntil ? `<div class="meta-item"><label>Válido hasta</label><span>${fmtDate(bud.validUntil)}</span></div>` : ''}
      <div class="meta-item"><label>Cliente</label><span>${bud.customerName ?? '—'}</span></div>
      ${bud.customerTaxId ? `<div class="meta-item"><label>CUIT</label><span>${bud.customerTaxId}</span></div>` : ''}
      ${bud.paymentTerms ? `<div class="meta-item"><label>Cond. de pago</label><span>${bud.paymentTerms}</span></div>` : ''}
      <div class="meta-item"><label>Moneda</label><span>${bud.currency}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="text-right">Cant.</th>
          <th class="text-right">Precio unit.</th>
          <th class="text-right">IVA</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="4" class="text-right">Subtotal</td>
          <td class="text-right">$ ${fmt(bud.subtotal)}</td>
        </tr>
        <tr>
          <td colspan="4" class="text-right">IVA</td>
          <td class="text-right">$ ${fmt(bud.taxAmount)}</td>
        </tr>
        <tr class="total-final">
          <td colspan="4" class="text-right">TOTAL</td>
          <td class="text-right">$ ${fmt(bud.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${notesBlock}
  `;

  await transporter.sendMail({
    from: `"${companyName}" <${from}>`,
    to,
    subject: `Presupuesto ${bud.number} — ${companyName}`,
    html: wrapHtml(`Presupuesto ${bud.number}`, body, companyName),
  });
}

// ── Remito email ───────────────────────────────────────────────────────────

export async function sendRemitoEmail(remitoId: string, to: string): Promise<void> {
  const { transporter, from } = await createTransporter();
  const companyName = await getCompanyName();

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      r.id, r.number, r.date, r."deliveryDate", r.status, r.notes, r."deliveryAddress",
      c.name AS "customerName", c.email AS "customerEmail",
      json_agg(
        json_build_object(
          'description', COALESCE(p.name, ri.description),
          'quantity', ri.quantity,
          'unit', ri.unit
        ) ORDER BY ri.id
      ) AS items
    FROM remitos r
    LEFT JOIN customers c ON r."customerId" = c.id
    LEFT JOIN remito_items ri ON ri."remitoId" = r.id
    LEFT JOIN products p ON ri."productId" = p.id
    WHERE r.id = ${remitoId}
    GROUP BY r.id, c.name, c.email
  `;

  if (!rows.length) throw new Error('Remito no encontrado');
  const rem = rows[0];

  const itemsRows = (rem.items as any[]).map((it) => `
    <tr>
      <td>${it.description}</td>
      <td class="text-right">${fmt(it.quantity, 0)}</td>
      <td>${it.unit ?? ''}</td>
    </tr>
  `).join('');

  const notesBlock = rem.notes ? `<div class="note">${rem.notes}</div>` : '';

  const body = `
    <div class="meta">
      <div class="meta-item"><label>Número</label><span>${rem.number}</span></div>
      <div class="meta-item"><label>Fecha</label><span>${fmtDate(rem.date)}</span></div>
      ${rem.deliveryDate ? `<div class="meta-item"><label>Fecha entrega</label><span>${fmtDate(rem.deliveryDate)}</span></div>` : ''}
      <div class="meta-item"><label>Cliente</label><span>${rem.customerName ?? '—'}</span></div>
      ${rem.deliveryAddress ? `<div class="meta-item"><label>Dirección</label><span>${rem.deliveryAddress}</span></div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="text-right">Cantidad</th>
          <th>Unidad</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    ${notesBlock}
  `;

  await transporter.sendMail({
    from: `"${companyName}" <${from}>`,
    to,
    subject: `Remito ${rem.number} — ${companyName}`,
    html: wrapHtml(`Remito ${rem.number}`, body, companyName),
  });
}
