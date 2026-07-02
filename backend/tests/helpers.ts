import 'reflect-metadata';
import '../src/container';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { createApp } from '../src/infrastructure/http/app';

export const app = createApp();
export const api = supertest(app);

interface TokenUser {
  id: string;
  username: string;
  role: string;
  companyId?: string;
}

/**
 * Firma un JWT idéntico al que emite LoginUseCase, para no pasar por
 * /api/auth/login en cada test (que además tiene rate limit).
 */
export function tokenFor(user: TokenUser): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role, companyId: user.companyId },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}

export function auth(user: TokenUser): { Authorization: string } {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

/** Falla con contexto útil si el status HTTP no es el esperado. */
export function expectStatus(res: supertest.Response, expected: number): void {
  if (res.status !== expected) {
    throw new Error(
      `Esperaba HTTP ${expected} pero llegó ${res.status}. Body: ${JSON.stringify(res.body)}`
    );
  }
}

/**
 * Los movimientos de stock de facturas/OP usan el almacén por defecto de la
 * empresa. Devuelve su id, creándolo si la empresa aún no tiene uno (los
 * archivos de test comparten la DB, así que puede existir de un test previo).
 */
export async function ensureDefaultWarehouse(user: TokenUser): Promise<string> {
  const list = await api.get('/api/warehouses').set(auth(user));
  expectStatus(list, 200);
  const existing = (list.body.data as Array<{ id: string; isDefault: boolean; isActive: boolean }>)
    .find((w) => w.isDefault && w.isActive);
  if (existing) return existing.id;

  const created = await api
    .post('/api/warehouses')
    .set(auth(user))
    .send({ name: 'Depósito Central (test)', isDefault: true });
  expectStatus(created, 201);
  return created.body.data.id;
}

/** Cantidad disponible (quantity) de un producto en un almacén; 0 si no hay fila de stock. */
export async function getStockQty(user: TokenUser, productId: string, warehouseId: string): Promise<number> {
  const res = await api.get(`/api/stock/${productId}/${warehouseId}`).set(auth(user));
  if (res.status === 404) return 0;
  expectStatus(res, 200);
  return Number(res.body.data.quantity);
}
