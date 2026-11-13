import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { AppError } from '../../../shared/errors/AppError';

/** Tope del adjunto ya decodificado. Un comprobante impreso pesa bastante menos. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const sendEmailSchema = z.object({
  // Una sola dirección: `email()` rechaza comas, espacios y saltos de línea, así
  // que no se pueden colar más destinatarios ni cabeceras.
  to: z.string().trim().max(254, 'Dirección demasiado larga').email('Ingresá una dirección de correo válida'),
  pdfBase64: z.string().optional().nullable(),
});

/**
 * Valida el body de los `send-email`. El PDF lo arma el navegador (es el mismo
 * diseño que se imprime), así que no se puede comprobar que su contenido sea el
 * del comprobante: se exige al menos que sea un PDF de tamaño razonable, y cada
 * envío queda en el historial con usuario y destinatario (ver logEmailSent).
 */
export function parseSendEmailBody(body: unknown): { to: string; pdfBase64?: string } {
  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? 'Datos de envío inválidos', 400);
  }
  const { to, pdfBase64 } = parsed.data;
  if (!pdfBase64) return { to };

  const raw = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) throw new AppError('El adjunto no es válido', 400);
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length > MAX_PDF_BYTES) throw new AppError('El adjunto supera los 10 MB', 400);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new AppError('El adjunto tiene que ser un PDF', 400);
  }
  return { to, pdfBase64: raw };
}

/**
 * Tope de envíos por usuario: el SMTP es el de la empresa y un abuso (o un
 * token robado) lo dejaría marcado como spam. Va después de authMiddleware.
 */
export const sendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId ?? 'anon',
  message: { status: 'error', message: 'Demasiados correos enviados. Intentá de nuevo más tarde.' },
});

/** Deja constancia de quién mandó qué comprobante y a qué dirección. */
export async function logEmailSent(req: Request, entity: string, entityId: string, to: string): Promise<void> {
  await container.resolve<IActivityLogRepository>('ActivityLogRepository').create({
    userId: req.user!.userId,
    action: 'UPDATE',
    entity,
    entityId,
    description: `Enviado por correo a ${to}`,
    metadata: { email: to },
  }).catch((e) => console.error('[send-email] no se pudo registrar el envío:', e));
}
