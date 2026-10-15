import { isAxiosError } from 'axios';

/**
 * Mensaje de error que devolvió la API (`{ status: 'error', message }`), o
 * `undefined` si el error no vino de ahí. Pensado para
 * `toast.error(apiErrorMessage(err) || 'Texto por defecto')`.
 */
export function apiErrorMessage(err: unknown): string | undefined {
  if (!isAxiosError(err)) return undefined;
  const message = (err.response?.data as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message ? message : undefined;
}
