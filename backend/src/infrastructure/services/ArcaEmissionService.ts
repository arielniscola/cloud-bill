import { container } from 'tsyringe';
import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { Invoice, InvoiceWithItems } from '../../domain/entities/Invoice';
import { AfipConfig } from '../../domain/entities/AfipConfig';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { saveAfipError, isArcaUnavailable } from '../../shared/utils/saveAfipError';
import { receptorProblemForArca } from '../../shared/utils/arcaReceptor';
import { afipService, EmitResult } from './AfipService';
import { pdvService } from './PdvService';

interface AuthorizeParams {
  invoiceId: string;
  companyId?: string;
  userId: string;
  pdv: { id: string; number: number };
  config: AfipConfig;
  originInvoice?: { type: string; date: Date; afipPtVenta: number | null; afipCbtNum: number | null } | null;
  /** Estado al que pasa la factura con el CAE, calculado sobre la versión releída. */
  nextStatus: (fresh: InvoiceWithItems) => string;
}

/**
 * Los errores de ARCA llegan como `Error` plano y el errorMiddleware los
 * respondía como 500 — en producción, "Internal server error" sin el motivo.
 * Acá se traducen: 503 si ARCA no respondió (el front lo usa para dejar la
 * venta pendiente de CAE), 422 con el mensaje de ARCA si la rechazó.
 */
export function toArcaAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (isArcaUnavailable(error)) {
    return new AppError(
      `ARCA no está disponible en este momento; la factura quedó sin CAE. Reintentá más tarde. (${message})`,
      503
    );
  }
  return new AppError(message, 422);
}

/**
 * Pide el CAE de una factura y lo guarda, todo bajo el lock de (pdv, tipo).
 *
 * - La factura se relee DENTRO del lock: dos pedidos simultáneos de la misma
 *   factura (doble clic, reintento) ya no obtienen dos CAE con números
 *   distintos; el segundo ve el CAE del primero y se rechaza.
 * - El CAE se guarda antes de soltar el lock y con el cliente global
 *   (autocommit): no se pierde aunque la tx del lock cierre con error.
 * - Si FECAESolicitar falla sin respuesta legible, se consulta a ARCA si el
 *   número quedó autorizado igual (FECompConsultar) y se adopta ese CAE.
 */
export async function authorizeInvoiceWithArca(
  params: AuthorizeParams
): Promise<{ result: EmitResult; updated: Invoice; previous: InvoiceWithItems }> {
  const invoiceRepo = container.resolve<IInvoiceRepository>('InvoiceRepository');
  const { invoiceId, companyId, userId, pdv, config, originInvoice } = params;

  const initial = await invoiceRepo.findById(invoiceId, companyId);
  if (!initial) throw new NotFoundError('Invoice');

  const receptorProblem = receptorProblemForArca(initial.type, (initial as any).customer);
  if (receptorProblem) throw new AppError(receptorProblem, 422);

  // El mismo TA sirve para el último número y para el CAE.
  const ta = await afipService.getTokenAuth(config).catch((e) => {
    throw toArcaAppError(e);
  });

  // `as` evita que TS fije el tipo en `null` (la asignación ocurre en el callback).
  let outcome = null as { result: EmitResult; updated: Invoice; previous: InvoiceWithItems } | null;

  try {
    await pdvService.runWithPdvLock(pdv.id, initial.type, async () => {
      const fresh = await invoiceRepo.findById(invoiceId, companyId);
      if (!fresh) throw new NotFoundError('Invoice');
      if (fresh.cae || fresh.status === 'AUTHORIZED') {
        throw new AppError('Esta factura ya está autorizada por ARCA', 409);
      }
      if (fresh.status === 'CANCELLED') {
        throw new AppError('La factura fue anulada; no se puede emitir ante ARCA', 400);
      }

      const cbteNro = await pdvService
        .getNextNumber(pdv.id, pdv.number, fresh.type, config, ta)
        .catch((e) => { throw toArcaAppError(e); });

      let result: EmitResult;
      try {
        result = await afipService.emitInvoice(fresh as any, config, pdv.number, cbteNro, originInvoice);
      } catch (afipError) {
        const recovered = await afipService
          .findAuthorizedVoucher(fresh as any, config, pdv.number, cbteNro)
          .catch(() => null);
        if (!recovered) {
          await saveAfipError(fresh.id, userId, afipError).catch(() => {});
          throw toArcaAppError(afipError);
        }
        console.warn(`[AFIP] CAE recuperado para ${fresh.number} (cbte ${cbteNro}) tras error:`, afipError);
        result = recovered;
      }

      let updated: Invoice;
      try {
        updated = await invoiceRepo.update(fresh.id, {
          cae: result.cae,
          caeExpiry: result.caeExpiry,
          afipCbtNum: result.afipCbtNum,
          afipPtVenta: result.afipPtVenta,
          afipObservaciones: result.observaciones,
          status: params.nextStatus(fresh),
        } as any);
      } catch (dbError) {
        // ARCA ya autorizó el número: dejamos rastro con el CAE para cargarlo a mano.
        const msg = `CAE ${result.cae} OTORGADO por ARCA (PtoVta ${result.afipPtVenta}, Nro ${result.afipCbtNum}) pero no se pudo guardar en la factura`;
        console.error(`[AFIP] ${msg}:`, dbError);
        await saveAfipError(fresh.id, userId, new Error(msg), result).catch(() => {});
        throw dbError;
      }

      outcome = { result, updated, previous: fresh };
    });
  } catch (error) {
    if (!outcome) throw error;
    // El CAE ya quedó guardado; sólo falló el cierre de la tx del lock.
    console.error('[AFIP] CAE guardado, pero la transacción del lock cerró con error:', error);
  }

  return outcome!;
}
