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
   * ARCA es la ÚNICA fuente de verdad sobre qué número fue autorizado. Siempre
   * consultamos FECompUltimoAutorizado y devolvemos `afipLast + 1`. NO usamos el
   * contador local para numerar.
   *
   * Por qué NO el contador local: si una emisión previa falló por un motivo que
   * NO es de numeración (validación, timeout luego de incrementar, etc.), el
   * contador local quedaría adelantado respecto a ARCA. Un `GREATEST(local, afip)+1`
   * mandaría afipLast+2 → ARCA lo rechaza con [10016] "el numero no se corresponde
   * con el proximo a autorizar". Numerando directo desde ARCA, un reintento tras
   * un fallo vuelve a calcular el mismo afipLast+1 correcto.
   *
   * Concurrencia: este método se invoca SIEMPRE dentro de `runWithPdvLock`, que
   * mantiene un advisory lock de Postgres por (pdv, tipo) durante sync+numeración
   * +emisión. Eso serializa terminales concurrentes del mismo PdV, así que no hace
   * falta un contador transaccional acá — cada emisión lee un afipLast fresco.
   *
   * El contador local se persiste sólo para trazabilidad/diagnóstico; no numera.
   */
  async getNextNumber(
    pdvId: string,
    pdvNumber: number,
    invoiceType: string,
    config: AfipConfig,
    ta: { token: string; sign: string }
  ): Promise<number> {
    const afipLast = await this._fetchAfipLastNumber(pdvNumber, invoiceType, config, ta);
    const nextNumber = afipLast + 1;

    // Persistimos para trazabilidad — NO se usa para numerar (ARCA manda).
    await prisma.$executeRaw`
      INSERT INTO "pdv_counters" ("id","pdvId","invoiceType","lastNumber","syncedFromAfip","updatedAt")
      VALUES (${randomUUID()}, ${pdvId}, ${invoiceType}, ${nextNumber}, true, NOW())
      ON CONFLICT ("pdvId","invoiceType") DO UPDATE
        SET "lastNumber"     = ${nextNumber},
            "syncedFromAfip" = true,
            "updatedAt"      = NOW()
    `;

    return nextNumber;
  }

  /**
   * Formats the AFIP invoice number string: "PPPP-NNNNNNNN"
   * e.g. pdvNumber=1, cbteNro=42 → "0001-00000042"
   */
  static formatAfipNumber(pdvNumber: number, cbteNro: number): string {
    return `${String(pdvNumber).padStart(4, '0')}-${String(cbteNro).padStart(8, '0')}`;
  }

  /**
   * Serializa la emisión a ARCA por (pdv, invoiceType) usando un advisory lock
   * de Postgres. ARCA exige que los comprobantes lleguen en orden estricto;
   * sin este lock, dos emisiones concurrentes pueden asignar 101/102 localmente
   * pero llegar a ARCA en orden inverso → rechazo [10016].
   *
   * El lock se mantiene durante todo el callback (sync + numeración + SOAP CAE)
   * y se libera al cerrar la transacción. Otras emisiones del MISMO (pdv, type)
   * bloquean en `pg_advisory_xact_lock`; otras empresas / pdv / tipo siguen libres.
   *
   * Timeout extendido a 60s porque el SOAP a ARCA suele tardar 1–3s.
   */
  async runWithPdvLock<T>(
    pdvId: string,
    invoiceType: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${pdvId}:${invoiceType}`;
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
        return fn();
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
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
