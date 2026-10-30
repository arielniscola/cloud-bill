import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B, SELLER_A } from '../fixtures';

/**
 * Motivos de retiros / ingresos de caja (Combustible, Viáticos…): catálogo por
 * empresa, se elige al registrar el movimiento y queda copiado en él.
 */
describe('Flujo crítico: motivos de movimientos de caja', () => {
  let cashRegisterId: string;
  let combustibleId: string;

  const createMovement = (body: Record<string, unknown>, user = ADMIN_A) =>
    api.post(`/api/cash-registers/${cashRegisterId}/cash-movements`).set(auth(user)).send({ amount: 100, ...body });

  beforeAll(async () => {
    const cr = await api.post('/api/cash-registers').set(auth(ADMIN_A)).send({ name: `Caja motivos ${Date.now()}` });
    expectStatus(cr, 201);
    cashRegisterId = cr.body.data.id;
  });

  it('alta del catálogo: nombre único por empresa sin importar mayúsculas', async () => {
    const res = await api.post('/api/cash-movement-reasons').set(auth(ADMIN_A)).send({ name: '  Combustible ', type: 'OUT' });
    expectStatus(res, 201);
    expect(res.body.data.name).toBe('Combustible');
    combustibleId = res.body.data.id;

    expectStatus(await api.post('/api/cash-movement-reasons').set(auth(ADMIN_A)).send({ name: 'COMBUSTIBLE' }), 409);
    // Otra empresa puede tener el mismo nombre.
    expectStatus(await api.post('/api/cash-movement-reasons').set(auth(ADMIN_B)).send({ name: 'Combustible' }), 201);
    // Un vendedor no administra el catálogo.
    expectStatus(await api.post('/api/cash-movement-reasons').set(auth(SELLER_A)).send({ name: 'Viáticos' }), 403);
  });

  it('el retiro guarda el motivo y valida sentido, empresa y estado', async () => {
    const ok = await createMovement({ type: 'OUT', concept: 'GASTO', reasonId: combustibleId });
    expectStatus(ok, 201);
    expect(ok.body.data.reasonId).toBe(combustibleId);
    expect(ok.body.data.reasonName).toBe('Combustible');

    // Motivo de egresos en un ingreso.
    expectStatus(await createMovement({ type: 'IN', concept: 'APORTE', reasonId: combustibleId }), 409);

    // Motivo de otra empresa.
    const ajeno = (await api.get('/api/cash-movement-reasons').set(auth(ADMIN_B))).body.data[0];
    expectStatus(await createMovement({ type: 'OUT', concept: 'GASTO', reasonId: ajeno.id }), 404);

    // Sin motivo sigue funcionando como antes.
    const sin = await createMovement({ type: 'OUT', concept: 'RETIRO' });
    expectStatus(sin, 201);
    expect(sin.body.data.reasonName).toBeNull();
  });

  it('el listado de la caja muestra el motivo y filtra por él', async () => {
    const all = await api.get(`/api/cash-registers/${cashRegisterId}/movements`).set(auth(ADMIN_A));
    expectStatus(all, 200);
    expect(all.body.total).toBe(2);
    const withReason = all.body.data.find((m: { cashMovement?: { reasonName: string | null } }) => m.cashMovement?.reasonName);
    expect(withReason.description).toContain('Combustible');

    const filtered = await api.get(`/api/cash-registers/${cashRegisterId}/movements`).query({ reasonId: combustibleId }).set(auth(ADMIN_A));
    expectStatus(filtered, 200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.data[0].cashMovement.reasonName).toBe('Combustible');
  });

  it('renombrar no cambia los movimientos ya registrados; eliminar uno usado lo desactiva', async () => {
    expectStatus(await api.put(`/api/cash-movement-reasons/${combustibleId}`).set(auth(ADMIN_A)).send({ name: 'Nafta' }), 200);
    const filtered = await api.get(`/api/cash-registers/${cashRegisterId}/movements`).query({ reasonId: combustibleId }).set(auth(ADMIN_A));
    expect(filtered.body.data[0].cashMovement.reasonName).toBe('Combustible');

    const del = await api.delete(`/api/cash-movement-reasons/${combustibleId}`).set(auth(ADMIN_A));
    expectStatus(del, 200);
    expect(del.body.data).toEqual({ deleted: false, deactivated: true });

    // Desactivado: no aparece para elegir y no se puede usar.
    const active = await api.get('/api/cash-movement-reasons').set(auth(ADMIN_A));
    expect(active.body.data.find((r: { id: string }) => r.id === combustibleId)).toBeUndefined();
    const withAll = await api.get('/api/cash-movement-reasons').query({ all: true }).set(auth(ADMIN_A));
    expect(withAll.body.data.find((r: { id: string }) => r.id === combustibleId)).toMatchObject({ isActive: false, usageCount: 1 });
    expectStatus(await createMovement({ type: 'OUT', concept: 'GASTO', reasonId: combustibleId }), 409);

    // Uno sin usar se borra de verdad.
    const viaticos = await api.post('/api/cash-movement-reasons').set(auth(ADMIN_A)).send({ name: 'Viáticos', type: 'BOTH' });
    const delUnused = await api.delete(`/api/cash-movement-reasons/${viaticos.body.data.id}`).set(auth(ADMIN_A));
    expect(delUnused.body.data).toEqual({ deleted: true, deactivated: false });
  });
});
