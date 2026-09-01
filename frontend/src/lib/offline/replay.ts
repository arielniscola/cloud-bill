import api from '../../services/api';
import { isNetworkError } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useCompanyStore } from '../../stores/company.store';
import { useOfflineStore } from '../../stores/offline.store';
import { countUnsent, listUnsent, markStatus, updateSale } from './outbox';
import type { OutboxSale } from './db';

/**
 * Sube las ventas encoladas.
 *
 * Reglas que lo gobiernan:
 *  - FIFO estricto y de a una. Son pocas y el orden importa para el operador;
 *    subirlas en paralelo solo complica el diagnostico cuando algo falla.
 *  - Cada intento manda `Idempotency-Key: <clientUuid>`. Si un envio anterior
 *    llego pero la respuesta se perdio, el servidor devuelve la orden existente
 *    en vez de crear una segunda.
 *  - Un error de RED deja la venta pendiente y corta la corrida (no tiene
 *    sentido seguir sin conexion). Un error del SERVIDOR (4xx) la marca FAILED
 *    y sigue con la siguiente: es un problema de esa venta, no de la cola.
 */

const MAX_ATTEMPTS = 10;

export interface ReplayResult {
  uploaded: number;
  failed: number;
  remaining: number;
  stoppedForNetwork: boolean;
}

let running = false;

/** Solo se sube lo que cargó este usuario para la empresa activa. */
function belongsToCurrentSession(sale: OutboxSale): boolean {
  const userId = useAuthStore.getState().user?.id ?? null;
  const companyId =
    useCompanyStore.getState().activeCompanyId ??
    useAuthStore.getState().user?.companyId ??
    null;

  if (sale.companyId && companyId && sale.companyId !== companyId) return false;
  if (sale.userId && userId && sale.userId !== userId) return false;
  return true;
}

export async function replayOutbox(): Promise<ReplayResult> {
  const result: ReplayResult = {
    uploaded: 0,
    failed: 0,
    remaining: 0,
    stoppedForNetwork: false,
  };

  // Una sola corrida a la vez: el reconectar y el timer pueden dispararse
  // juntos, y dos corridas encimadas reintentarian la misma venta.
  if (running) return result;
  if (useOfflineStore.getState().connection === 'offline') return result;
  running = true;

  try {
    const pending = await listUnsent();

    for (const sale of pending) {
      if (!belongsToCurrentSession(sale)) continue;
      if (sale.attempts >= MAX_ATTEMPTS && sale.status === 'FAILED') continue;

      await markStatus(sale.clientUuid, 'SENDING');
      try {
        const res = await api.post<{ data: { id: string; number: string } }>(
          '/orden-pedidos',
          { ...(sale.payload as object), clientUuid: sale.clientUuid },
          { headers: { 'Idempotency-Key': sale.clientUuid } }
        );
        const created = res.data.data;
        await updateSale(sale.clientUuid, {
          status: 'SENT',
          serverId: created?.id ?? null,
          serverNumber: created?.number ?? null,
          lastError: null,
        });
        result.uploaded++;
      } catch (err) {
        if (isNetworkError(err)) {
          // Se corto la conexion: la venta vuelve a PENDING y se corta acá.
          await markStatus(sale.clientUuid, 'PENDING');
          result.stoppedForNetwork = true;
          break;
        }
        const message = extractError(err);
        await markStatus(sale.clientUuid, 'FAILED', message);
        result.failed++;
      }
    }
  } finally {
    running = false;
  }

  result.remaining = await countUnsent();
  useOfflineStore.getState().setPendingSales(result.remaining);
  return result;
}

/** Reintenta una venta que quedo en FAILED, a pedido del usuario. */
export async function retrySale(clientUuid: string): Promise<boolean> {
  await markStatus(clientUuid, 'PENDING');
  const result = await replayOutbox();
  return result.uploaded > 0;
}

function extractError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { message?: string } } };
  const status = e.response?.status;
  const message = e.response?.data?.message;
  if (message) return status ? `${status}: ${message}` : message;
  return status ? `Error ${status}` : 'Error desconocido';
}
