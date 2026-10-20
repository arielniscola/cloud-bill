import prisma from '../../infrastructure/database/prisma';

/**
 * Fallas de conectividad con ARCA (caída, timeout, 5xx). Se chequean ANTES que
 * las de autenticación: un timeout del WSAA dice "WSAA error: timeout…" y no es
 * un problema de certificado.
 */
const UNAVAILABLE_PATTERNS = [
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'ECONNABORTED',
  'socket hang up', 'timeout of', 'Service Unavailable', 'Bad Gateway', 'Gateway Time',
  'status code 502', 'status code 503', 'status code 504',
];

export function classifyAfipError(message: string): string {
  if (UNAVAILABLE_PATTERNS.some((p) => message.includes(p))) return 'CONNECTION_ERROR';
  if (message.includes('WSAA') || message.includes('token') || message.includes('sign')) return 'AUTH_ERROR';
  if (message.includes('CAE rechazado')) return 'CAE_REJECTED';
  if (message.includes('ARCA - Error')) return 'HARD_ERROR';
  return 'UNKNOWN';
}

/** true si el error es porque ARCA no respondió (vale reintentar más tarde). */
export function isArcaUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return classifyAfipError(message) === 'CONNECTION_ERROR';
}

export async function saveAfipError(
  invoiceId: string,
  userId: string,
  error: unknown,
  rawResponse?: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const errorType = classifyAfipError(message);

  await prisma.$executeRaw`
    INSERT INTO "invoice_afip_errors" ("invoiceId", "userId", "errorMessage", "errorType", "rawResponse")
    VALUES (
      ${invoiceId},
      ${userId},
      ${message},
      ${errorType},
      ${rawResponse ? JSON.stringify(rawResponse) : null}
    )
  `;
}
