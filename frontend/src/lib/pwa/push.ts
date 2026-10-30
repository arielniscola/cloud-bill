import api from '../../services/api';
import type { ApiResponse } from '../../types';

// Avisos Web Push de la PWA (aprobaciones). La suscripción es del navegador;
// el backend la ata al usuario logueado. Al cerrar sesión se da de baja en los
// dos lados, así quien entre después en la misma máquina no recibe avisos
// ajenos y tiene que activarlos él.

export type PushState =
  | 'unsupported' // navegador sin Push API o sin service worker (p. ej. `vite dev`)
  | 'not-configured' // el servidor no tiene claves VAPID
  | 'denied' // el usuario bloqueó las notificaciones del sitio
  | 'off'
  | 'on';

const SW_TIMEOUT_MS = 4000;

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** El SW solo existe en el build (no en `vite dev`): no esperar para siempre. */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_TIMEOUT_MS)),
  ]);
}

async function getPublicKey(): Promise<string | null> {
  const response = await api.get<ApiResponse<{ publicKey: string | null }>>('/push/public-key');
  return response.data.data?.publicKey ?? null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = urlBase64ToUint8Array(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function getPushState(): Promise<PushState> {
  const reg = await getRegistration();
  if (!reg) return 'unsupported';
  if (!(await getPublicKey())) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Pide permiso (debe llamarse desde un click) y registra este dispositivo. */
export async function enablePush(): Promise<PushState> {
  const reg = await getRegistration();
  if (!reg) return 'unsupported';
  const publicKey = await getPublicKey();
  if (!publicKey) return 'not-configured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  let sub = await reg.pushManager.getSubscription();
  // Si el servidor cambió de claves, la suscripción vieja ya no sirve.
  if (sub && !sameKey(sub, publicKey)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await api.post('/push/subscribe', sub.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

export async function sendTestPush(): Promise<number> {
  const response = await api.post<ApiResponse<{ sent: number }>>('/push/test');
  return response.data.data?.sent ?? 0;
}

/**
 * Al entrar a la app: si este navegador ya estaba suscripto, re-afirma la
 * suscripción en el servidor (puede haberse borrado o el endpoint rotado).
 */
export async function resyncPush(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api.post('/push/subscribe', sub.toJSON()).catch(() => {});
}

/**
 * Al cerrar sesión. Recibe el token porque el store ya lo está limpiando: se
 * manda explícito y el interceptor no lo pisa (solo agrega el del store si hay).
 */
export async function unsubscribePushOnLogout(token: string | null): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (token) {
    await api
      .post('/push/unsubscribe', { endpoint: sub.endpoint }, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {});
  }
  await sub.unsubscribe().catch(() => {});
}
