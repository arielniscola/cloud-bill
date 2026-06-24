import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';

// ── CSV parser ────────────────────────────────────────────────────
function parseRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(raw: string): Array<Record<string, string>> {
  // Strip UTF-8 BOM
  const text = raw.replace(/^\uFEFF/, '');
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.every((v) => !v.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k];
  return '';
}

type ImportError = { row: number; message: string };

export class ImportController {

  // ── POST /products/import ─────────────────────────────────────
  async importProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const rows = parseCsv(csv);
      if (rows.length === 0) {
        res.status(400).json({ status: 'error', message: 'El archivo no tiene filas válidas' });
        return;
      }

      // Pre-load rubros and brands by name for this company
      const [rubros, brands] = await Promise.all([
        prisma.rubro.findMany({ where: { companyId }, select: { id: true, name: true } }),
        prisma.brand.findMany({ where: { companyId }, select: { id: true, name: true } }),
      ]);
      const rubroMap = new Map(rubros.map((c) => [c.name.toLowerCase(), c.id]));
      const brandMap    = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));

      let imported = 0;
      let skipped  = 0;
      const errors: ImportError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row    = rows[i];
        const rowNum = i + 2;

        const sku  = pick(row, 'sku');
        const name = pick(row, 'nombre', 'name');
        if (!sku)  { errors.push({ row: rowNum, message: 'SKU requerido' });    skipped++; continue; }
        if (!name) { errors.push({ row: rowNum, message: 'Nombre requerido' }); skipped++; continue; }

        const costStr  = pick(row, 'costo', 'cost');
        const priceStr = pick(row, 'precio', 'price', 'precioventa');
        const cost     = parseFloat(costStr  || '0');
        const price    = parseFloat(priceStr || '0');
        if (isNaN(cost)  || cost  < 0) { errors.push({ row: rowNum, message: 'Costo inválido' });  skipped++; continue; }
        if (isNaN(price) || price < 0) { errors.push({ row: rowNum, message: 'Precio inválido' }); skipped++; continue; }

        const taxRateStr = pick(row, 'iva', 'taxrate', 'tasaiva');
        const taxRate    = parseFloat(taxRateStr || '21');

        const rubroName = pick(row, 'rubro', 'rubro').toLowerCase();
        const brandName    = pick(row, 'marca', 'brand').toLowerCase();
        const rubroId   = rubroName ? (rubroMap.get(rubroName) ?? null) : null;
        const brandId      = brandName    ? (brandMap.get(brandName)       ?? null) : null;

        const unit        = pick(row, 'unidad', 'unit')               || 'UN';
        const barcode     = pick(row, 'codigobarras', 'barcode')       || null;
        const description = pick(row, 'descripcion', 'description')    || null;

        try {
          // Check if product exists in this company
          const existing = await prisma.product.findFirst({ where: { sku, companyId }, select: { id: true } });
          if (existing) {
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                name,
                description,
                cost:  new Prisma.Decimal(cost),
                price: new Prisma.Decimal(price),
                taxRate: new Prisma.Decimal(isNaN(taxRate) ? 21 : taxRate),
                unit,
                ...(barcode     && { barcode }),
                ...(rubroId  && { rubroId }),
                ...(brandId     && { brandId }),
              },
            });
          } else {
            await prisma.product.create({
              data: {
                sku,
                name,
                description,
                cost:  new Prisma.Decimal(cost),
                price: new Prisma.Decimal(price),
                taxRate: new Prisma.Decimal(isNaN(taxRate) ? 21 : taxRate),
                unit,
                barcode:    barcode    ?? undefined,
                rubroId: rubroId ?? undefined,
                brandId:    brandId    ?? undefined,
                companyId,
              },
            });
          }
          imported++;
        } catch (err: any) {
          const msg = err?.code === 'P2002' ? 'SKU ya existe en otra empresa' : (err?.message ?? 'Error al procesar');
          errors.push({ row: rowNum, message: msg });
          skipped++;
        }
      }

      res.json({ status: 'success', data: { imported, skipped, total: rows.length, errors } });
    } catch (error) {
      next(error);
    }
  }

  // ── POST /customers/import ────────────────────────────────────
  async importCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const rows = parseCsv(csv);
      if (rows.length === 0) {
        res.status(400).json({ status: 'error', message: 'El archivo no tiene filas válidas' });
        return;
      }

      const TAX_MAP: Record<string, string> = {
        'responsableinscripto': 'RESPONSABLE_INSCRIPTO',
        'ri': 'RESPONSABLE_INSCRIPTO',
        'monotributista': 'MONOTRIBUTISTA',
        'mono': 'MONOTRIBUTISTA',
        'exento': 'EXENTO',
        'consumidorfinal': 'CONSUMIDOR_FINAL',
        'cf': 'CONSUMIDOR_FINAL',
        '': 'CONSUMIDOR_FINAL',
      };

      let imported = 0;
      let skipped  = 0;
      const errors: ImportError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row    = rows[i];
        const rowNum = i + 2;

        const name = pick(row, 'nombre', 'name', 'razonsocial');
        if (!name) { errors.push({ row: rowNum, message: 'Nombre requerido' }); skipped++; continue; }

        const taxId = pick(row, 'cuit', 'taxid', 'cuit/cuil', 'cuil') || null;

        const rawTax     = pick(row, 'condicioniva', 'taxcondition', 'condicióniva').toLowerCase().replace(/\s/g, '');
        const taxCond    = TAX_MAP[rawTax] ?? 'CONSUMIDOR_FINAL';
        const rawSale    = pick(row, 'condicionventa', 'salecondition', 'condiciónventa').toLowerCase().replace(/\s/g, '');
        const saleCond   = rawSale === 'cuentacorriente' || rawSale === 'cc' ? 'CUENTA_CORRIENTE' : 'CONTADO';

        const address    = pick(row, 'direccion', 'address')                   || null;
        const city       = pick(row, 'ciudad', 'city')                         || null;
        const province   = pick(row, 'provincia', 'province')                  || null;
        const postalCode = pick(row, 'codigopostal', 'postalcode', 'cp')       || null;
        const phone      = pick(row, 'telefono', 'phone', 'tel')               || null;
        const email      = pick(row, 'email', 'mail', 'correo')                || null;
        const notes      = pick(row, 'notas', 'notes', 'observaciones')        || null;

        try {
          // Find existing customer by taxId + companyId (or just companyId+name if no taxId)
          let existingId: string | null = null;
          if (taxId) {
            const rows2 = await prisma.$queryRaw<{ id: string }[]>`
              SELECT id FROM customers WHERE "taxId" = ${taxId} AND "companyId" = ${companyId} LIMIT 1
            `;
            existingId = rows2[0]?.id ?? null;
          }

          if (existingId) {
            // Update — use regular update for non-saleCondition fields
            await prisma.customer.update({
              where: { id: existingId },
              data: { name, address: address ?? undefined, city: city ?? undefined, province: province ?? undefined, postalCode: postalCode ?? undefined, phone: phone ?? undefined, email: email ?? undefined, notes: notes ?? undefined },
            });
            await prisma.$executeRaw`
              UPDATE customers SET "saleCondition" = ${saleCond} WHERE id = ${existingId}
            `;
          } else {
            // Create — use raw to include saleCondition (stale Prisma client workaround)
            await prisma.$executeRaw`
              INSERT INTO customers (id, name, "taxId", "taxCondition", "saleCondition", address, city, province, "postalCode", phone, email, notes, "isActive", "companyId", "createdAt", "updatedAt")
              VALUES (
                gen_random_uuid(),
                ${name},
                ${taxId},
                ${taxCond}::"TaxCondition",
                ${saleCond},
                ${address},
                ${city},
                ${province},
                ${postalCode},
                ${phone},
                ${email},
                ${notes},
                true,
                ${companyId},
                NOW(), NOW()
              )
            `;
          }
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, message: err?.message ?? 'Error al procesar' });
          skipped++;
        }
      }

      res.json({ status: 'success', data: { imported, skipped, total: rows.length, errors } });
    } catch (error) {
      next(error);
    }
  }

  // ── POST /suppliers/import ────────────────────────────────────
  async importSuppliers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const rows = parseCsv(csv);
      if (rows.length === 0) {
        res.status(400).json({ status: 'error', message: 'El archivo no tiene filas válidas' });
        return;
      }

      const TAX_MAP: Record<string, string> = {
        'responsableinscripto': 'RESPONSABLE_INSCRIPTO',
        'ri':                   'RESPONSABLE_INSCRIPTO',
        'monotributista':       'MONOTRIBUTISTA',
        'mono':                 'MONOTRIBUTISTA',
        'exento':               'EXENTO',
        'consumidorfinal':      'CONSUMIDOR_FINAL',
        'cf':                   'CONSUMIDOR_FINAL',
        '':                     'CONSUMIDOR_FINAL',
      };

      let imported = 0;
      let skipped  = 0;
      const errors: ImportError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row    = rows[i];
        const rowNum = i + 2;

        const name = pick(row, 'nombre', 'name', 'razonsocial');
        if (!name) { errors.push({ row: rowNum, message: 'Nombre requerido' }); skipped++; continue; }

        const cuit  = pick(row, 'cuit', 'taxid') || null;
        const rawTax = pick(row, 'condicioniva', 'taxcondition', 'condicióniva').toLowerCase().replace(/\s/g, '');
        const taxCondition = TAX_MAP[rawTax] ?? 'CONSUMIDOR_FINAL';

        const address = pick(row, 'direccion', 'address') || null;
        const city    = pick(row, 'ciudad', 'city')       || null;
        const phone   = pick(row, 'telefono', 'phone', 'tel') || null;
        const email   = pick(row, 'email', 'mail', 'correo') || null;
        const notes   = pick(row, 'notas', 'notes', 'observaciones') || null;

        try {
          let existingId: string | null = null;
          if (cuit) {
            const found = await prisma.$queryRaw<{ id: string }[]>`
              SELECT id FROM suppliers WHERE cuit = ${cuit} AND "companyId" = ${companyId} LIMIT 1
            `;
            existingId = found[0]?.id ?? null;
          }

          if (existingId) {
            await prisma.$executeRaw`
              UPDATE suppliers
              SET name = ${name},
                  "taxCondition" = ${taxCondition}::"TaxCondition",
                  address = ${address},
                  city    = ${city},
                  phone   = ${phone},
                  email   = ${email},
                  notes   = ${notes},
                  "updatedAt" = NOW()
              WHERE id = ${existingId}
            `;
          } else {
            await prisma.$executeRaw`
              INSERT INTO suppliers (id, name, cuit, "taxCondition", address, city, phone, email, notes, "isActive", "companyId", "createdAt", "updatedAt")
              VALUES (
                gen_random_uuid(),
                ${name},
                ${cuit},
                ${taxCondition}::"TaxCondition",
                ${address},
                ${city},
                ${phone},
                ${email},
                ${notes},
                true,
                ${companyId},
                NOW(), NOW()
              )
            `;
          }
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, message: err?.message ?? 'Error al procesar' });
          skipped++;
        }
      }

      res.json({ status: 'success', data: { imported, skipped, total: rows.length, errors } });
    } catch (error) {
      next(error);
    }
  }
}
