import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';

import { parseCsv, pick, parseNumber } from '../utils/csvImport';

type ImportError = { row: number; message: string };

export class ImportController {

  // ── POST /products/import ─────────────────────────────────────
  async importProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      // El frontend parte archivos grandes en lotes (evita el timeout de las
      // funciones serverless) — rowOffset ajusta el número de fila reportado
      // en los errores para que coincida con el archivo original completo.
      const rowOffset = Number(req.body?.rowOffset) || 0;
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const { rows, malformed } = parseCsv(csv);
      if (rows.length === 0) {
        res.status(400).json({ status: 'error', message: 'El archivo no tiene filas válidas' });
        return;
      }

      // Pre-load rubros, brands and suppliers by name for this company.
      // Solo se vinculan los existentes (no se crean nuevos en la importación).
      const [rubros, brands, supplierRows] = await Promise.all([
        prisma.rubro.findMany({ where: { companyId }, select: { id: true, name: true, parentId: true } }),
        prisma.brand.findMany({ where: { companyId }, select: { id: true, name: true } }),
        prisma.supplier.findMany({ where: { companyId }, select: { id: true, name: true } }),
      ]);
      const rubroById = new Map(rubros.map((r) => [r.id, r]));
      const rubroByName = new Map<string, string>();        // nombre -> id (fallback)
      const rubroByParentChild = new Map<string, string>(); // `${padre}|${hijo}` -> id (desambigua por "super rubro")
      for (const r of rubros) {
        rubroByName.set(r.name.toLowerCase(), r.id);
        const parentName = r.parentId ? (rubroById.get(r.parentId)?.name.toLowerCase() ?? '') : '';
        if (parentName) rubroByParentChild.set(`${parentName}|${r.name.toLowerCase()}`, r.id);
      }
      const brandMap = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));
      const supplierMap = new Map(supplierRows.map((s) => [s.name.toLowerCase(), s.id]));

      let imported = 0;
      let skipped  = 0;
      const errors: ImportError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row    = rows[i];
        const rowNum = i + 2 + rowOffset;

        const structural = malformed.get(i);
        if (structural) { errors.push({ row: rowNum, message: structural }); skipped++; continue; }

        const sku  = pick(row, 'sku');
        const name = pick(row, 'nombre', 'name');
        if (!sku)  { errors.push({ row: rowNum, message: 'SKU requerido' });    skipped++; continue; }
        if (!name) { errors.push({ row: rowNum, message: 'Nombre requerido' }); skipped++; continue; }

        const costStr  = pick(row, 'costo', 'cost');
        const priceStr = pick(row, 'precio', 'price', 'precioventa');
        const cost     = parseNumber(costStr  || '0');
        const price    = parseNumber(priceStr || '0');
        if (isNaN(cost)  || cost  < 0) { errors.push({ row: rowNum, message: 'Costo inválido' });  skipped++; continue; }
        if (isNaN(price) || price < 0) { errors.push({ row: rowNum, message: 'Precio inválido' }); skipped++; continue; }

        let taxRate = parseNumber(pick(row, 'iva', 'taxrate', 'tasaiva') || '21');
        // El archivo trae el IVA como fracción (0.21); lo normalizamos a porcentaje.
        if (!isNaN(taxRate) && taxRate > 0 && taxRate <= 1) taxRate = taxRate * 100;

        const usdStr = pick(row, 'preciousd', 'salepriceusd', 'preciosivausd', 'precioventausd');
        const salePriceUSD = usdStr ? parseNumber(usdStr) : NaN;
        const hasUSD = !isNaN(salePriceUSD) && salePriceUSD > 0;

        const rubroName      = pick(row, 'rubro').toLowerCase();
        const superRubroName = pick(row, 'superrubro', 'rubropadre').toLowerCase();
        const brandName      = pick(row, 'marca', 'brand').toLowerCase();
        const supplierName   = pick(row, 'proveedor', 'supplier').toLowerCase();
        let rubroId: string | null = null;
        if (rubroName) {
          if (superRubroName) rubroId = rubroByParentChild.get(`${superRubroName}|${rubroName}`) ?? null;
          if (!rubroId) rubroId = rubroByName.get(rubroName) ?? null;
        }
        const brandId = brandName ? (brandMap.get(brandName) ?? null) : null;
        const supplierId = supplierName ? (supplierMap.get(supplierName) ?? null) : null;

        const unit          = pick(row, 'unidad', 'unit')                          || 'UN';
        const barcode       = pick(row, 'codigobarras', 'barcode')                  || null;
        const description   = pick(row, 'descripcion', 'description')               || null;
        // "Cod prov" del archivo → notas internas (solo al crear, ver abajo)
        const internalNotes = pick(row, 'notasinternas', 'codprov', 'internalnotes', 'codigoproveedor') || null;

        try {
          // Check if product exists in this company
          const existing = await prisma.product.findFirst({ where: { sku, companyId }, select: { id: true } });
          let productId: string;
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
                ...(hasUSD && { salePriceUSD: new Prisma.Decimal(salePriceUSD) }),
                // internalNotes NO se pisa al actualizar (preserva notas cargadas en la app)
              },
            });
            productId = existing.id;
          } else {
            const created = await prisma.product.create({
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
                ...(hasUSD && { salePriceUSD: new Prisma.Decimal(salePriceUSD) }),
                ...(internalNotes && { internalNotes }),
                companyId,
              },
            });
            productId = created.id;
          }
          // supplierId no está en el cliente Prisma generado todavía — raw SQL
          // (ver PrismaProductRepository). Solo se pisa si el archivo trajo un
          // proveedor reconocido, para no borrar uno ya cargado a mano.
          if (supplierId) {
            await prisma.$executeRaw`UPDATE products SET "supplierId" = ${supplierId} WHERE id = ${productId}`;
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
      const rowOffset = Number(req.body?.rowOffset) || 0; // ver comentario en importProducts
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const { rows, malformed } = parseCsv(csv);
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
        const rowNum = i + 2 + rowOffset;

        const structural = malformed.get(i);
        if (structural) { errors.push({ row: rowNum, message: structural }); skipped++; continue; }

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
      const rowOffset = Number(req.body?.rowOffset) || 0; // ver comentario en importProducts
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const { rows, malformed } = parseCsv(csv);
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
        const rowNum = i + 2 + rowOffset;

        const structural = malformed.get(i);
        if (structural) { errors.push({ row: rowNum, message: structural }); skipped++; continue; }

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

  // ── POST /bancos/import ───────────────────────────────────────
  // Bancos no tienen un código único confiable (el campo "code" es libre y
  // muchas veces viene vacío) — se deduplica por nombre, sin distinguir
  // mayúsculas/minúsculas, dentro de la misma empresa.
  async importBancos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId!;
      const rowOffset = Number(req.body?.rowOffset) || 0; // ver comentario en importProducts
      const csv = req.body?.csv as string;
      if (!csv?.trim()) {
        res.status(400).json({ status: 'error', message: 'CSV vacío o inválido' });
        return;
      }

      const { rows, malformed } = parseCsv(csv);
      if (rows.length === 0) {
        res.status(400).json({ status: 'error', message: 'El archivo no tiene filas válidas' });
        return;
      }

      const existing = await prisma.banco.findMany({
        where: { companyId },
        select: { id: true, name: true },
      });
      const byName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b.id]));

      let imported = 0;
      let skipped  = 0;
      const errors: ImportError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row    = rows[i];
        const rowNum = i + 2 + rowOffset;

        const structural = malformed.get(i);
        if (structural) { errors.push({ row: rowNum, message: structural }); skipped++; continue; }

        const name = pick(row, 'nombre', 'name', 'banco');
        if (!name) { errors.push({ row: rowNum, message: 'Nombre requerido' }); skipped++; continue; }

        const code     = pick(row, 'codigo', 'code') || null;
        const sucursal = pick(row, 'sucursal', 'branch') || null;

        try {
          const existingId = byName.get(name.trim().toLowerCase());
          if (existingId) {
            await prisma.banco.update({
              where: { id: existingId },
              data: { code: code ?? undefined, sucursal: sucursal ?? undefined },
            });
          } else {
            const created = await prisma.banco.create({
              data: { name, code, sucursal, isActive: true, companyId },
            });
            byName.set(name.trim().toLowerCase(), created.id);
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
