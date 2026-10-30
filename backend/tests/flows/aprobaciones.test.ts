import { api, auth, expectStatus } from '../helpers';
import prisma from '../../src/infrastructure/database/prisma';
import { ADMIN_A, SELLER_A, OWNER_A, ADMIN_B } from '../fixtures';

/**
 * Rol Dueño + solicitudes de aprobación: las acciones protegidas que pide
 * alguien que no es Dueño quedan pendientes (y bloquean el documento) hasta
 * que un Dueño las aprueba (se ejecutan) o las rechaza.
 */
describe('Flujo crítico: aprobaciones del Dueño', () => {
  let customerId: string;
  let productId: string;

  const reason = (text: string) => ({ 'X-Approval-Reason': encodeURIComponent(text) });

  async function createInvoice(): Promise<string> {
    const res = await api
      .post('/api/invoices')
      .set(auth(ADMIN_A))
      .send({
        type: 'FACTURA_B',
        customerId,
        saleCondition: 'CONTADO',
        items: [{ productId, quantity: 1, unitPrice: 100, taxRate: 21 }],
      });
    expectStatus(res, 201);
    return res.body.data.id;
  }

  async function invoiceStatus(id: string): Promise<string> {
    const res = await api.get(`/api/invoices/${id}`).set(auth(ADMIN_A));
    expectStatus(res, 200);
    return res.body.data.status;
  }

  beforeAll(async () => {
    const customer = await api.post('/api/customers').set(auth(ADMIN_A)).send({ name: 'Cliente Aprobaciones (test)' });
    expectStatus(customer, 201);
    customerId = customer.body.data.id;

    const product = await api
      .post('/api/products')
      .set(auth(ADMIN_A))
      .send({ sku: `APR-${Date.now()}`, name: 'Servicio Aprobaciones (test)', cost: 50, price: 100, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    productId = product.body.data.id;

    // Arranca con la configuración por defecto (todas protegidas).
    expectStatus(await api.put('/api/approvals/settings').set(auth(OWNER_A)).send({ disabledActions: [] }), 200);
  });

  it('el Dueño hereda los permisos de ADMIN', async () => {
    // Ruta solo-ADMIN.
    expectStatus(await api.get('/api/users').set(auth(OWNER_A)), 200);
  });

  it('ADMIN sin motivo recibe 428; con motivo queda pendiente y la factura no se anula', async () => {
    const id = await createInvoice();

    const sinMotivo = await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A));
    expectStatus(sinMotivo, 428);
    expect(sinMotivo.body.code).toBe('APPROVAL_REQUIRED');
    expect(sinMotivo.body.data.action).toBe('INVOICE_CANCEL');

    const conMotivo = await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)).set(reason('Cliente se arrepintió'));
    expectStatus(conMotivo, 202);
    expect(conMotivo.body.pendingApproval).toBe(true);
    expect(await invoiceStatus(id)).not.toBe('CANCELLED');

    // Bloqueo: ni otra solicitud ni editar ni emitir.
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)).set(reason('otra')), 409);
    expectStatus(await api.post(`/api/invoices/${id}/emit`).set(auth(ADMIN_A)), 409);
    expectStatus(await api.delete(`/api/invoices/${id}`).set(auth(OWNER_A)), 409);

    const open = await api.get(`/api/approvals/entity/INVOICE/${id}`).set(auth(ADMIN_A));
    expectStatus(open, 200);
    expect(open.body.data.reason).toBe('Cliente se arrepintió');
    expect(open.body.data.requestedByName).toBe(ADMIN_A.name);

    // El solicitante no puede aprobar.
    expectStatus(await api.post(`/api/approvals/${open.body.data.id}/approve`).set(auth(ADMIN_A)), 403);

    const count = await api.get('/api/approvals/pending-count').set(auth(OWNER_A));
    expectStatus(count, 200);
    expect(count.body.data.count).toBeGreaterThanOrEqual(1);

    const approved = await api.post(`/api/approvals/${open.body.data.id}/approve`).set(auth(OWNER_A)).send({ comment: 'Ok' });
    expectStatus(approved, 200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(await invoiceStatus(id)).toBe('CANCELLED');

    // Ya resuelta: no se aprueba dos veces.
    expectStatus(await api.post(`/api/approvals/${open.body.data.id}/approve`).set(auth(OWNER_A)), 409);
    const after = await api.get(`/api/approvals/entity/INVOICE/${id}`).set(auth(ADMIN_A));
    expect(after.body.data).toBeNull();
  });

  it('rechazar no ejecuta la acción y desbloquea el documento', async () => {
    const id = await createInvoice();
    const req = await api.delete(`/api/invoices/${id}`).set(auth(SELLER_A)).set(reason('Borrador duplicado'));
    expectStatus(req, 202);
    expect(req.body.data.action).toBe('INVOICE_DELETE');

    const rejected = await api.post(`/api/approvals/${req.body.data.id}/reject`).set(auth(OWNER_A)).send({ comment: 'No' });
    expectStatus(rejected, 200);
    expect(rejected.body.data.status).toBe('REJECTED');
    expect(await invoiceStatus(id)).toBe('DRAFT');

    // Desbloqueada: se puede volver a pedir. Al aprobar, el borrador se elimina (204 re-ejecutado).
    const again = await api.delete(`/api/invoices/${id}`).set(auth(SELLER_A)).set(reason('De nuevo'));
    expectStatus(again, 202);
    const approved = await api.post(`/api/approvals/${again.body.data.id}/approve`).set(auth(OWNER_A));
    expectStatus(approved, 200);
    expect(approved.body.data.status).toBe('APPROVED');
    expectStatus(await api.get(`/api/invoices/${id}`).set(auth(ADMIN_A)), 404);

    // El vendedor ve solo sus solicitudes.
    const mine = await api.get('/api/approvals?status=ALL').set(auth(SELLER_A));
    expectStatus(mine, 200);
    expect((mine.body.data as Array<{ requestedById: string }>).every((r) => r.requestedById === SELLER_A.id)).toBe(true);
  });

  it('una acción que el rol no permite sigue dando 403 (la aprobación no amplía permisos)', async () => {
    const id = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(SELLER_A)).set(reason('x')), 403);
  });

  it('el Dueño ejecuta directo y queda registrado como autoaprobado', async () => {
    const id = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(OWNER_A)), 200);
    expect(await invoiceStatus(id)).toBe('CANCELLED');

    // El registro se escribe al terminar la respuesta.
    await new Promise((r) => setTimeout(r, 200));
    const history = await api.get('/api/approvals?status=APPROVED').set(auth(OWNER_A));
    expectStatus(history, 200);
    const auto = (history.body.data as Array<{ entityId: string; autoApproved: boolean }>).find((r) => r.entityId === id);
    expect(auto?.autoApproved).toBe(true);
  });

  it('el listado de solicitudes abiertas por lote marca el documento para cualquier usuario de la empresa', async () => {
    const pendingId = await createInvoice();
    const freeId = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${pendingId}/cancel`).set(auth(ADMIN_A)).set(reason('Marca en listado')), 202);

    // Otro usuario (no el que pidió) también ve la marca: el documento está bloqueado igual.
    const open = await api.get('/api/approvals/open').query({ entityType: 'INVOICE', ids: `${pendingId},${freeId}` }).set(auth(SELLER_A));
    expectStatus(open, 200);
    expect(open.body.data).toHaveLength(1);
    expect(open.body.data[0].entityId).toBe(pendingId);
    expect(open.body.data[0].reason).toBe('Marca en listado');

    // Otra empresa no ve nada.
    const other = await api.get('/api/approvals/open').query({ entityType: 'INVOICE', ids: pendingId }).set(auth(ADMIN_B));
    expectStatus(other, 200);
    expect(other.body.data).toHaveLength(0);

    expectStatus(await api.get('/api/approvals/open').query({ entityType: 'NOPE', ids: pendingId }).set(auth(ADMIN_A)), 400);

    await api.post(`/api/approvals/${open.body.data[0].id}/reject`).set(auth(OWNER_A));
  });

  it('una empresa sin Dueño no pide aprobación: la acción se ejecuta directo', async () => {
    // COMPANY_B no tiene ningún OWNER.
    const customer = await api.post('/api/customers').set(auth(ADMIN_B)).send({ name: 'Cliente sin Dueño (test)' });
    expectStatus(customer, 201);
    const product = await api
      .post('/api/products')
      .set(auth(ADMIN_B))
      .send({ sku: `APR-B-${Date.now()}`, name: 'Servicio sin Dueño (test)', cost: 50, price: 100, taxRate: 21, trackStock: false });
    expectStatus(product, 201);
    const inv = await api
      .post('/api/invoices')
      .set(auth(ADMIN_B))
      .send({ type: 'FACTURA_B', customerId: customer.body.data.id, saleCondition: 'CONTADO', items: [{ productId: product.body.data.id, quantity: 1, unitPrice: 100, taxRate: 21 }] });
    expectStatus(inv, 201);

    expectStatus(await api.post(`/api/invoices/${inv.body.data.id}/cancel`).set(auth(ADMIN_B)), 200);
    const after = await api.get(`/api/invoices/${inv.body.data.id}`).set(auth(ADMIN_B));
    expect(after.body.data.status).toBe('CANCELLED');
  });

  it('si la empresa se queda sin Dueño, las solicitudes pendientes se cierran y el documento se libera', async () => {
    const id = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)).set(reason('Quedará huérfana')), 202);
    const open = await api.get(`/api/approvals/entity/INVOICE/${id}`).set(auth(ADMIN_A));
    const requestId = open.body.data.id;

    await prisma.user.update({ where: { id: OWNER_A.id }, data: { isActive: false } });
    try {
      // Sin Dueño activo: el pedido no lo resuelve nadie, así que se cierra y la anulación pasa directo.
      expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)), 200);
      expect(await invoiceStatus(id)).toBe('CANCELLED');

      const row = await prisma.$queryRaw<{ status: string; resolutionComment: string }[]>`
        SELECT status, "resolutionComment" FROM "approval_requests" WHERE id = ${requestId}
      `;
      expect(row[0].status).toBe('REJECTED');
      expect(row[0].resolutionComment).toContain('no tiene un Dueño activo');
    } finally {
      await prisma.user.update({ where: { id: OWNER_A.id }, data: { isActive: true } });
    }

    // Con el Dueño de vuelta, el control vuelve a regir.
    const next = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${next}/cancel`).set(auth(ADMIN_A)), 428);
  });

  it('una acción desactivada en la configuración se ejecuta sin aprobación', async () => {
    expectStatus(await api.put('/api/approvals/settings').set(auth(ADMIN_A)).send({ disabledActions: ['INVOICE_CANCEL'] }), 403);
    const settings = await api.put('/api/approvals/settings').set(auth(OWNER_A)).send({ disabledActions: ['INVOICE_CANCEL'] });
    expectStatus(settings, 200);
    expect((settings.body.data as Array<{ key: string; enabled: boolean }>).find((a) => a.key === 'INVOICE_CANCEL')?.enabled).toBe(false);

    const id = await createInvoice();
    expectStatus(await api.post(`/api/invoices/${id}/cancel`).set(auth(ADMIN_A)), 200);
    expect(await invoiceStatus(id)).toBe('CANCELLED');

    expectStatus(await api.put('/api/approvals/settings').set(auth(OWNER_A)).send({ disabledActions: [] }), 200);
  });
});
