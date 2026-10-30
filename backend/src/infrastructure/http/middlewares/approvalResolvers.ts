import { Request } from 'express';
import prisma from '../../database/prisma';
import { ApprovalResolver } from './approvalMiddleware';

// Cada resolver identifica el documento que toca la ruta y qué acción
// protegida es. Devuelven null si no existe en la empresa (el handler da el 404).

interface DocRow { number: string; type?: string; status?: string }

const isNote = (type?: string) => !!type && (type.startsWith('NOTA_CREDITO') || type.startsWith('NOTA_DEBITO'));

async function findInvoice(req: Request): Promise<DocRow | null> {
  const rows = await prisma.$queryRaw<DocRow[]>`
    SELECT number, type::text AS type, status::text AS status FROM "invoices"
    WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} LIMIT 1
  `;
  return rows[0] ?? null;
}

const target = (row: DocRow, label: string) => `${label} ${row.number}`;

export const resolveInvoiceCancel: ApprovalResolver = async (req) => {
  const inv = await findInvoice(req);
  if (!inv) return null;
  return {
    action: isNote(inv.type) ? 'NOTE_CANCEL' : 'INVOICE_CANCEL',
    entityType: 'INVOICE',
    entityId: req.params.id,
    entityLabel: target(inv, isNote(inv.type) ? 'Nota' : 'Factura'),
  };
};

export const resolveInvoiceDelete: ApprovalResolver = async (req) => {
  const inv = await findInvoice(req);
  if (!inv) return null;
  return {
    action: isNote(inv.type) ? 'NOTE_CANCEL' : 'INVOICE_DELETE',
    entityType: 'INVOICE',
    entityId: req.params.id,
    entityLabel: target(inv, isNote(inv.type) ? 'Nota (borrador)' : 'Factura (borrador)'),
  };
};

// Cobrar una factura es libre; "pagar" una NC es una devolución y está protegida.
export const resolveInvoicePay: ApprovalResolver = async (req) => {
  const inv = await findInvoice(req);
  if (!inv) return null;
  const isCreditNote = !!inv.type?.startsWith('NOTA_CREDITO');
  return {
    action: isCreditNote ? 'CREDIT_NOTE_REFUND' : null,
    entityType: 'INVOICE',
    entityId: req.params.id,
    entityLabel: target(inv, isCreditNote ? 'Nota de crédito' : 'Factura'),
  };
};

export const resolveRemitoCancel: ApprovalResolver = async (req) => {
  const rows = await prisma.$queryRaw<DocRow[]>`
    SELECT number FROM "remitos" WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} LIMIT 1
  `;
  if (!rows[0]) return null;
  return { action: 'REMITO_CANCEL', entityType: 'REMITO', entityId: req.params.id, entityLabel: target(rows[0], 'Remito') };
};

export const resolvePurchaseRemitoCancel: ApprovalResolver = async (req) => {
  const rows = await prisma.$queryRaw<DocRow[]>`
    SELECT number FROM "purchase_remitos" WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    action: 'PURCHASE_REMITO_CANCEL',
    entityType: 'PURCHASE_REMITO',
    entityId: req.params.id,
    entityLabel: target(rows[0], 'Remito de compra'),
  };
};

export const resolveReciboCancel: ApprovalResolver = async (req) => {
  const rows = await prisma.$queryRaw<DocRow[]>`
    SELECT number FROM "recibos" WHERE id = ${req.params.id} AND "companyId" = ${req.companyId} LIMIT 1
  `;
  if (!rows[0]) return null;
  return { action: 'RECIBO_CANCEL', entityType: 'RECIBO', entityId: req.params.id, entityLabel: target(rows[0], 'Recibo') };
};

export const resolveCashMovementCancel: ApprovalResolver = async (req) => {
  const rows = await prisma.$queryRaw<DocRow[]>`
    SELECT number FROM "cash_movements"
    WHERE id = ${req.params.movementId} AND "cashRegisterId" = ${req.params.id} AND "companyId" = ${req.companyId} LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    action: 'CASH_MOVEMENT_CANCEL',
    entityType: 'CASH_MOVEMENT',
    entityId: req.params.movementId,
    entityLabel: target(rows[0], 'Movimiento de caja'),
  };
};
