import prisma from '../../infrastructure/database/prisma';

function classifyAfipError(message: string): string {
  if (message.includes('WSAA') || message.includes('token') || message.includes('sign')) return 'AUTH_ERROR';
  if (message.includes('CAE rechazado')) return 'CAE_REJECTED';
  if (message.includes('ARCA - Error')) return 'HARD_ERROR';
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('ENOTFOUND')) return 'CONNECTION_ERROR';
  return 'UNKNOWN';
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
