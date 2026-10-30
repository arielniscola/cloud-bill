import webpush from 'web-push';
import { randomUUID } from 'crypto';
import prisma from '../database/prisma';

// Avisos Web Push a la PWA (aprobaciones del Dueño). Las claves VAPID salen del
// entorno; sin ellas el push queda apagado y la app sigue con la campana.
// Cambiar las claves invalida todas las suscripciones: generarlas una vez con
// `npx web-push generate-vapid-keys` y no rotarlas.

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta de la app a abrir al tocar el aviso. */
  url: string;
  /** Avisos con el mismo tag se reemplazan en vez de apilarse. */
  tag?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY sin configurar: avisos push desactivados.');
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@cloudbill.local', publicKey, privateKey);
  configured = true;
  return configured;
}

export function getVapidPublicKey(): string | null {
  return ensureConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

/** Alta o reasignación: el endpoint identifica al navegador, no al usuario. */
export async function saveSubscription(
  userId: string,
  companyId: string | null,
  sub: PushSubscriptionInput,
  userAgent: string | null
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "push_subscriptions" (id, "userId", "companyId", endpoint, p256dh, auth, "userAgent", "createdAt")
    VALUES (${randomUUID()}, ${userId}, ${companyId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent}, NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      "userId" = EXCLUDED."userId", "companyId" = EXCLUDED."companyId",
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, "userAgent" = EXCLUDED."userAgent"
  `;
}

export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "push_subscriptions" WHERE endpoint = ${endpoint} AND "userId" = ${userId}`;
}

export async function countSubscriptions(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "push_subscriptions" WHERE "userId" = ${userId}
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Manda el aviso a todos los dispositivos de esos usuarios. Nunca lanza. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length || !ensureConfigured()) return 0;
  try {
    const subs = await prisma.$queryRaw<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
      SELECT id, endpoint, p256dh, auth FROM "push_subscriptions" WHERE "userId" = ANY(${userIds}::text[])
    `;
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 60 * 60 });
          sent++;
          await prisma.$executeRaw`UPDATE "push_subscriptions" SET "lastUsedAt" = NOW() WHERE id = ${s.id}`;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: el navegador dio de baja la suscripción (permiso revocado, app desinstalada).
          if (status === 404 || status === 410) {
            await prisma.$executeRaw`DELETE FROM "push_subscriptions" WHERE id = ${s.id}`;
          } else {
            console.error(`[Push] Falló el envío (${status ?? 'sin status'}):`, (err as Error).message);
          }
        }
      })
    );
    return sent;
  } catch (err) {
    console.error('[Push] Error enviando avisos:', err);
    return 0;
  }
}

/** Usuarios activos de la empresa con alguno de esos roles. */
export async function findUserIdsByRoles(companyId: string, roles: string[], excludeUserId?: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "users"
    WHERE "companyId" = ${companyId} AND role::text = ANY(${roles}::text[]) AND "isActive" = true
      AND id <> ${excludeUserId ?? ''}
  `;
  return rows.map((r) => r.id);
}

/** Dueños activos de la empresa (destinatarios de una solicitud nueva). */
export async function findOwnerIds(companyId: string, excludeUserId?: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "users"
    WHERE "companyId" = ${companyId} AND role = 'OWNER' AND "isActive" = true
      AND id <> ${excludeUserId ?? ''}
  `;
  return rows.map((r) => r.id);
}
