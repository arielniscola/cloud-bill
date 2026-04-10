import { randomUUID } from 'crypto';
import * as soap from 'soap';
import prisma from '../database/prisma';
import { AfipConfig } from '../../domain/entities/AfipConfig';

const WSFE_WSDL = {
  prod: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
  test: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
};

const INVOICE_TYPE_AFIP_CODE: Record<string, number> = {
  FACTURA_A:      1,
  NOTA_DEBITO_A:  2,
  NOTA_CREDITO_A: 3,
  FACTURA_B:      6,
  NOTA_DEBITO_B:  7,
  NOTA_CREDITO_B: 8,
  FACTURA_C:      11,
  NOTA_DEBITO_C:  12,
  NOTA_CREDITO_C: 13,
};

export interface PdvNumberResult {
  pdvNumber: number;   // AFIP punto de venta (e.g. 1)
  cbteNro: number;     // sequential number assigned atomically
}

export class PdvService {
  /**
   * Returns the user's assigned PdV.
   * Throws if the user has no PdV assigned.
   */
  async getPdvForUser(userId: string): Promise<{ id: string; number: number; name: string }> {
    const rows = await prisma.$queryRaw<{ pdvId: string | null }[]>`
      SELECT "pdvId" FROM "users" WHERE id = ${userId} LIMIT 1
    `;
    const pdvId = rows[0]?.pdvId;
    if (!pdvId) {
      throw new Error(
        'Este usuario no tiene un Punto de Venta asignado. ' +
        'Un administrador debe asignarle una terminal en Configuración → Terminales.'
      );
    }

    const pdvRows = await prisma.$queryRaw<{ id: string; number: number; name: string; isActive: boolean }[]>`
      SELECT id, number, name, "isActive" FROM "puntos_de_venta" WHERE id = ${pdvId} LIMIT 1
    `;
    const pdv = pdvRows[0];
    if (!pdv) throw new Error('Punto de venta no encontrado');
    if (!pdv.isActive) throw new Error(`El Punto de Venta "${pdv.name}" está inactivo`);

    return pdv;
  }

  /**
   * Gets the next sequential number for a PdV + invoice type.
   *
   * Strategy:
   *  1. If counter doesn't exist or hasn't been synced with AFIP → fetch last number
   *     from AFIP's FECompUltimoAutorizado (outside transaction — avoids holding DB lock during IO)
   *  2. Atomically increment the counter using SELECT FOR UPDATE (prevents race conditions
   *     between concurrent terminals on the same PdV)
   *
   * The number is committed BEFORE calling AFIP for the CAE. If AFIP fails,
   * the invoice stays DRAFT with the assigned number — retrying uses the same number.
   */
  async getNextNumber(
    pdvId: string,
    pdvNumber: number,
    invoiceType: string,
    config: AfipConfig,
    ta: { token: string; sign: string }
  ): Promise<number> {
    // ── Step 1: Ensure counter exists and is synced ───────────────────────────
    const counter = await this._getCounter(pdvId, invoiceType);

    if (!counter || !counter.syncedFromAfip) {
      // Sync from AFIP — do this OUTSIDE the transaction to avoid long lock
      const afipLast = await this._fetchAfipLastNumber(pdvNumber, invoiceType, config, ta);

      // Upsert with GREATEST so concurrent syncs never go backwards
      await prisma.$executeRaw`
        INSERT INTO "pdv_counters" ("id","pdvId","invoiceType","lastNumber","syncedFromAfip","updatedAt")
        VALUES (${randomUUID()}, ${pdvId}, ${invoiceType}, ${afipLast}, true, NOW())
        ON CONFLICT ("pdvId","invoiceType") DO UPDATE
          SET "lastNumber"     = GREATEST("pdv_counters"."lastNumber", EXCLUDED."lastNumber"),
              "syncedFromAfip" = true,
              "updatedAt"      = NOW()
      `;
    }

    // ── Step 2: Atomic increment inside a serializable transaction ───────────
    const result = await prisma.$transaction(async (tx) => {
      // FOR UPDATE locks this specific row — concurrent terminals on same PdV
      // will block here and get the next number in sequence
      const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
        SELECT "lastNumber" FROM "pdv_counters"
        WHERE "pdvId" = ${pdvId} AND "invoiceType" = ${invoiceType}
        FOR UPDATE
      `;

      const lastNumber = Number(rows[0]?.lastNumber ?? 0);
      const nextNumber = lastNumber + 1;

      await tx.$executeRaw`
        UPDATE "pdv_counters"
        SET "lastNumber" = ${nextNumber}, "updatedAt" = NOW()
        WHERE "pdvId" = ${pdvId} AND "invoiceType" = ${invoiceType}
      `;

      return nextNumber;
    });

    return result;
  }

  /**
   * Formats the AFIP invoice number string: "PPPP-NNNNNNNN"
   * e.g. pdvNumber=1, cbteNro=42 → "0001-00000042"
   */
  static formatAfipNumber(pdvNumber: number, cbteNro: number): string {
    return `${String(pdvNumber).padStart(4, '0')}-${String(cbteNro).padStart(8, '0')}`;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _getCounter(
    pdvId: string,
    invoiceType: string
  ): Promise<{ lastNumber: number; syncedFromAfip: boolean } | null> {
    const rows = await prisma.$queryRaw<{ lastNumber: number; syncedFromAfip: boolean }[]>`
      SELECT "lastNumber", "syncedFromAfip" FROM "pdv_counters"
      WHERE "pdvId" = ${pdvId} AND "invoiceType" = ${invoiceType}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async _fetchAfipLastNumber(
    pdvNumber: number,
    invoiceType: string,
    config: AfipConfig,
    ta: { token: string; sign: string }
  ): Promise<number> {
    const cbteTipo = INVOICE_TYPE_AFIP_CODE[invoiceType];
    if (cbteTipo === undefined) throw new Error(`Tipo de comprobante no soportado: ${invoiceType}`);

    const env = config.isProduction ? 'prod' : 'test';
    const wsfeClient = await soap.createClientAsync(WSFE_WSDL[env]);

    const [lastRes] = await (wsfeClient as any).FECompUltimoAutorizadoAsync({
      Auth: { Token: ta.token, Sign: ta.sign, Cuit: config.cuit },
      PtoVta: pdvNumber,
      CbteTipo: cbteTipo,
    });

    return Number(lastRes?.FECompUltimoAutorizadoResult?.CbteNro ?? 0);
  }
}

export const pdvService = new PdvService();
