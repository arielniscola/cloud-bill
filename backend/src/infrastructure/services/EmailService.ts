import nodemailer from 'nodemailer';
import prisma from '../database/prisma';
import { generatePdfFromHtml } from './PdfService';

/** Convert a base64 string to a Buffer. */
function base64ToBuffer(b64: string): Buffer {
  const data = b64.includes(',') ? b64.split(',')[1] : b64;
  return Buffer.from(data, 'base64');
}

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

// ── PDF document HTML template ────────────────────────────────────────────
// This generates a professional A4-ready document (not the email body).

function buildPdfHtml(title: string, companyName: string, companyInfo: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #222; line-height: 1.5; }
  .doc { padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #4f46e5; }
  .header-left h1 { font-size: 20px; color: #4f46e5; margin-bottom: 2px; }
  .header-left p { font-size: 11px; color: #666; }
  .header-right { text-align: right; font-size: 11px; color: #555; }
  .header-right strong { display: block; font-size: 14px; color: #222; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-bottom: 20px; padding: 12px 16px; background: #f8f8fb; border-radius: 6px; }
  .meta-item { }
  .meta-item label { display: block; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1px; }
  .meta-item span { font-size: 12px; font-weight: 600; color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  th { background: #f0f0f5; text-align: left; padding: 7px 10px; font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #ddd; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  .text-right { text-align: right; }
  .totals-row td { border-top: 2px solid #ddd; font-weight: 600; }
  .total-final td { background: #f0f0f5; font-size: 14px; font-weight: 700; color: #4f46e5; }
  .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; font-size: 11px; color: #92400e; margin-bottom: 16px; }
  .cae-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px; font-size: 11px; color: #166534; margin-bottom: 16px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #aaa; text-align: center; }
</style>
</head>
<body>
<div class="doc">
  <div class="header">
    <div class="header-left">
      <h1>${companyName}</h1>
      <p>${companyInfo}</p>
    </div>
    <div class="header-right">
      <strong>${title}</strong>
    </div>
  </div>
  ${body}
  <div class="footer">Documento generado por ${companyName}</div>
</div>
</body>
</html>`;
}

// ── Short email body (the email itself, with PDF attached) ────────────────

function buildEmailHtml(title: string, summary: string, companyName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f7; margin: 0; padding: 0; color: #222; }
  .wrapper { max-width: 520px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .header { background: #4f46e5; color: #fff; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header p  { margin: 4px 0 0; font-size: 12px; opacity: .85; }
  .body { padding: 24px 28px; font-size: 14px; line-height: 1.6; color: #444; }
  .body p { margin-bottom: 12px; }
  .highlight { background: #f0f0f5; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #333; }
  .footer { padding: 14px 28px; background: #f8f8fb; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${title}</h1>
    <p>${companyName}</p>
  </div>
  <div class="body">
    <p>Estimado/a cliente,</p>
    <p>Adjuntamos el siguiente documento para su referencia:</p>
    <div class="highlight">${summary}</div>
    <p style="margin-top:16px; font-size:12px; color:#888;">El documento se encuentra adjunto en formato PDF.</p>
  </div>
  <div class="footer">Este correo fue generado automáticamente por ${companyName}. No responder a este mensaje.</div>
</div>
</body>
</html>`;
}

// ── Transporter factory ────────────────────────────────────────────────────

async function createTransporter(companyId: string) {
  const settings = await prisma.$queryRaw<any[]>`
    SELECT "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom", "smtpSecure"
    FROM "app_settings"
    WHERE "id" = ${companyId}
    LIMIT 1
  `;

  const s = settings[0];
  if (!s?.smtpHost || !s?.smtpUser || !s?.smtpPass) {
    throw new Error('SMTP no configurado. Completá la configuración en Ajustes → Correo.');
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

// ── Company info helper ───────────────────────────────────────────────────

async function getCompanyInfo(companyId: string): Promise<{ name: string; info: string }> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "businessName", "businessAddress", cuit, "taxCondition"
    FROM "afip_config" WHERE "companyId" = ${companyId} LIMIT 1
  `;
  if (rows[0]?.businessName) {
    const a = rows[0];
    const parts = [a.businessAddress, a.cuit ? `CUIT: ${a.cuit}` : null].filter(Boolean);
    return { name: a.businessName, info: parts.join(' — ') };
  }
  const company = await prisma.$queryRaw<any[]>`
    SELECT name FROM "companies" WHERE id = ${companyId} LIMIT 1
  `;
  return { name: company[0]?.name || 'Cloud Bill', info: '' };
}

// ── Invoice email ──────────────────────────────────────────────────────────

export async function sendInvoiceEmail(invoiceId: string, to: string, companyId: string, pdfBase64?: string): Promise<void> {
  const { transporter, from } = await createTransporter(companyId);
  const company = await getCompanyInfo(companyId);

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      i.id, i.number, i.type, i.date, i."dueDate", i.subtotal, i."taxAmount", i.total,
      i.currency, i.status, i.notes, i."paymentTerms", i.cae, i."caeExpiry",
      c.name AS "customerName", c.email AS "customerEmail",
      c."taxId" AS "customerTaxId",
      json_agg(
        json_build_object(
          'description', p.name,
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
  const currencySymbol = inv.currency === 'USD' ? 'U$D' : '$';

  const itemsRows = (inv.items as any[]).map((it) => `
    <tr>
      <td>${it.description}</td>
      <td class="text-right">${fmt(it.quantity, 0)}</td>
      <td class="text-right">${currencySymbol} ${fmt(it.unitPrice)}</td>
      <td class="text-right">${fmt(Number(it.taxRate))}%</td>
      <td class="text-right">${currencySymbol} ${fmt(it.total)}</td>
    </tr>
  `).join('');

  const caeBlock = inv.cae ? `
    <div class="cae-box">
      <strong>CAE:</strong> ${inv.cae} &nbsp;|&nbsp;
      <strong>Vto.:</strong> ${fmtDate(inv.caeExpiry)}
    </div>
  ` : '';

  const notesBlock = inv.notes ? `<div class="note"><strong>Notas:</strong> ${inv.notes}</div>` : '';

  const pdfBody = `
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
          <td class="text-right">${currencySymbol} ${fmt(inv.subtotal)}</td>
        </tr>
        <tr>
          <td colspan="4" class="text-right">IVA</td>
          <td class="text-right">${currencySymbol} ${fmt(inv.taxAmount)}</td>
        </tr>
        <tr class="total-final">
          <td colspan="4" class="text-right">TOTAL</td>
          <td class="text-right">${currencySymbol} ${fmt(inv.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${caeBlock}
    ${notesBlock}
  `;

  const safeNumber = (inv.number ?? 'factura').replace(/[^a-zA-Z0-9\-]/g, '_');
  const emailSummary = `<strong>${typeLabel} ${inv.number}</strong><br/>
    Fecha: ${fmtDate(inv.date)}<br/>
    Total: ${currencySymbol} ${fmt(inv.total)}`;

  let pdfBuffer: Buffer;
  if (pdfBase64) {
    pdfBuffer = base64ToBuffer(pdfBase64);
  } else {
    const pdfHtml = buildPdfHtml(`${typeLabel} ${inv.number}`, company.name, company.info, pdfBody);
    pdfBuffer = await generatePdfFromHtml(pdfHtml);
  }

  await transporter.sendMail({
    from: `"${company.name}" <${from}>`,
    to,
    subject: `${typeLabel} ${inv.number} — ${company.name}`,
    html: buildEmailHtml(`${typeLabel} ${inv.number}`, emailSummary, company.name),
    attachments: [{
      filename: `${safeNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

// ── Budget email ───────────────────────────────────────────────────────────

export async function sendBudgetEmail(budgetId: string, to: string, companyId: string, pdfBase64?: string): Promise<void> {
  const { transporter, from } = await createTransporter(companyId);
  const company = await getCompanyInfo(companyId);

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
  const currencySymbol = bud.currency === 'USD' ? 'U$D' : '$';

  const itemsRows = (bud.items as any[]).map((it) => `
    <tr>
      <td>${it.description}</td>
      <td class="text-right">${fmt(it.quantity, 0)}</td>
      <td class="text-right">${currencySymbol} ${fmt(it.unitPrice)}</td>
      <td class="text-right">${fmt(Number(it.taxRate))}%</td>
      <td class="text-right">${currencySymbol} ${fmt(it.total)}</td>
    </tr>
  `).join('');

  const notesBlock = bud.notes ? `<div class="note"><strong>Notas:</strong> ${bud.notes}</div>` : '';

  const pdfBody = `
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
          <td class="text-right">${currencySymbol} ${fmt(bud.subtotal)}</td>
        </tr>
        <tr>
          <td colspan="4" class="text-right">IVA</td>
          <td class="text-right">${currencySymbol} ${fmt(bud.taxAmount)}</td>
        </tr>
        <tr class="total-final">
          <td colspan="4" class="text-right">TOTAL</td>
          <td class="text-right">${currencySymbol} ${fmt(bud.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${notesBlock}
  `;

  const safeNumber = (bud.number ?? 'presupuesto').replace(/[^a-zA-Z0-9\-]/g, '_');
  let pdfBuffer: Buffer;
  if (pdfBase64) {
    pdfBuffer = base64ToBuffer(pdfBase64);
  } else {
    const pdfHtml = buildPdfHtml(`Presupuesto ${bud.number}`, company.name, company.info, pdfBody);
    pdfBuffer = await generatePdfFromHtml(pdfHtml);
  }
  const emailSummary = `<strong>Presupuesto ${bud.number}</strong><br/>
    Fecha: ${fmtDate(bud.date)}<br/>
    Total: ${currencySymbol} ${fmt(bud.total)}`;

  await transporter.sendMail({
    from: `"${company.name}" <${from}>`,
    to,
    subject: `Presupuesto ${bud.number} — ${company.name}`,
    html: buildEmailHtml(`Presupuesto ${bud.number}`, emailSummary, company.name),
    attachments: [{
      filename: `${safeNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

// ── Orden de Pedido email ──────────────────────────────────────────────────

export async function sendOrdenPedidoEmail(ordenPedidoId: string, to: string, companyId: string, pdfBase64?: string): Promise<void> {
  const { transporter, from } = await createTransporter(companyId);
  const company = await getCompanyInfo(companyId);

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      op.id, op.number, op.date, op."dueDate", op.subtotal, op."taxAmount", op.total,
      op.currency, op.status, op.notes, op."paymentTerms",
      c.name AS "customerName", c.email AS "customerEmail", c."taxId" AS "customerTaxId",
      json_agg(
        json_build_object(
          'description', oi.description,
          'quantity', oi.quantity,
          'unitPrice', oi."unitPrice",
          'taxRate', oi."taxRate",
          'total', oi.total
        ) ORDER BY oi.id
      ) AS items
    FROM orden_pedidos op
    LEFT JOIN customers c ON op."customerId" = c.id
    LEFT JOIN orden_pedido_items oi ON oi."ordenPedidoId" = op.id
    WHERE op.id = ${ordenPedidoId}
    GROUP BY op.id, c.name, c.email, c."taxId"
  `;

  if (!rows.length) throw new Error('Orden de pedido no encontrada');
  const op = rows[0];
  const currencySymbol = op.currency === 'USD' ? 'U$D' : '$';

  const itemsRows = (op.items as any[]).map((it) => `
    <tr>
      <td>${it.description}</td>
      <td class="text-right">${fmt(it.quantity, 0)}</td>
      <td class="text-right">${currencySymbol} ${fmt(it.unitPrice)}</td>
      <td class="text-right">${fmt(Number(it.taxRate))}%</td>
      <td class="text-right">${currencySymbol} ${fmt(it.total)}</td>
    </tr>
  `).join('');

  const notesBlock = op.notes ? `<div class="note"><strong>Notas:</strong> ${op.notes}</div>` : '';

  const pdfBody = `
    <div class="meta">
      <div class="meta-item"><label>Número</label><span>${op.number}</span></div>
      <div class="meta-item"><label>Fecha</label><span>${fmtDate(op.date)}</span></div>
      ${op.dueDate ? `<div class="meta-item"><label>Fecha entrega</label><span>${fmtDate(op.dueDate)}</span></div>` : ''}
      <div class="meta-item"><label>Cliente</label><span>${op.customerName ?? '—'}</span></div>
      ${op.customerTaxId ? `<div class="meta-item"><label>CUIT</label><span>${op.customerTaxId}</span></div>` : ''}
      ${op.paymentTerms ? `<div class="meta-item"><label>Cond. de pago</label><span>${op.paymentTerms}</span></div>` : ''}
      <div class="meta-item"><label>Moneda</label><span>${op.currency}</span></div>
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
          <td class="text-right">${currencySymbol} ${fmt(op.subtotal)}</td>
        </tr>
        <tr>
          <td colspan="4" class="text-right">IVA</td>
          <td class="text-right">${currencySymbol} ${fmt(op.taxAmount)}</td>
        </tr>
        <tr class="total-final">
          <td colspan="4" class="text-right">TOTAL</td>
          <td class="text-right">${currencySymbol} ${fmt(op.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${notesBlock}
  `;

  const safeNumber = (op.number ?? 'orden-pedido').replace(/[^a-zA-Z0-9\-]/g, '_');
  let pdfBuffer: Buffer;
  if (pdfBase64) {
    pdfBuffer = base64ToBuffer(pdfBase64);
  } else {
    const pdfHtml = buildPdfHtml(`Orden de Pedido ${op.number}`, company.name, company.info, pdfBody);
    pdfBuffer = await generatePdfFromHtml(pdfHtml);
  }
  const emailSummary = `<strong>Orden de Pedido ${op.number}</strong><br/>
    Fecha: ${fmtDate(op.date)}<br/>
    Total: ${currencySymbol} ${fmt(op.total)}`;

  await transporter.sendMail({
    from: `"${company.name}" <${from}>`,
    to,
    subject: `Orden de Pedido ${op.number} — ${company.name}`,
    html: buildEmailHtml(`Orden de Pedido ${op.number}`, emailSummary, company.name),
    attachments: [{
      filename: `${safeNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

// ── Remito email ───────────────────────────────────────────────────────────

export async function sendRemitoEmail(remitoId: string, to: string, companyId: string, pdfBase64?: string): Promise<void> {
  const { transporter, from } = await createTransporter(companyId);
  const company = await getCompanyInfo(companyId);

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

  const notesBlock = rem.notes ? `<div class="note"><strong>Notas:</strong> ${rem.notes}</div>` : '';

  const pdfBody = `
    <div class="meta">
      <div class="meta-item"><label>Número</label><span>${rem.number}</span></div>
      <div class="meta-item"><label>Fecha</label><span>${fmtDate(rem.date)}</span></div>
      ${rem.deliveryDate ? `<div class="meta-item"><label>Fecha entrega</label><span>${fmtDate(rem.deliveryDate)}</span></div>` : ''}
      <div class="meta-item"><label>Cliente</label><span>${rem.customerName ?? '—'}</span></div>
      ${rem.deliveryAddress ? `<div class="meta-item"><label>Dirección entrega</label><span>${rem.deliveryAddress}</span></div>` : ''}
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

  const safeNumber = (rem.number ?? 'remito').replace(/[^a-zA-Z0-9\-]/g, '_');
  let pdfBuffer: Buffer;
  if (pdfBase64) {
    pdfBuffer = base64ToBuffer(pdfBase64);
  } else {
    const pdfHtml = buildPdfHtml(`Remito ${rem.number}`, company.name, company.info, pdfBody);
    pdfBuffer = await generatePdfFromHtml(pdfHtml);
  }
  const emailSummary = `<strong>Remito ${rem.number}</strong><br/>
    Fecha: ${fmtDate(rem.date)}<br/>
    Cliente: ${rem.customerName ?? '—'}`;

  await transporter.sendMail({
    from: `"${company.name}" <${from}>`,
    to,
    subject: `Remito ${rem.number} — ${company.name}`,
    html: buildEmailHtml(`Remito ${rem.number}`, emailSummary, company.name),
    attachments: [{
      filename: `${safeNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}
