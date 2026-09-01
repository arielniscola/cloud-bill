import fs from 'fs/promises';
import path from 'path';
import { api, auth, expectStatus } from '../helpers';
import { ADMIN_A, ADMIN_B, COMPANY_A, COMPANY_B } from '../fixtures';
import prisma from '../../src/infrastructure/database/prisma';
import { invalidateModuleCache } from '../../src/infrastructure/http/middlewares/moduleMiddleware';

/**
 * Imagen de producto de punta a punta, con el driver de storage local:
 * gating por módulo, URL firmada, PUT del archivo, confirmación y lectura
 * pública. Con el driver S3 el único tramo distinto es a qué host va el PUT.
 */
describe('Flujo crítico: imagen de producto', () => {
  const UPLOAD_DIR = path.resolve(process.cwd(), 'tmp/test-uploads');

  let productId: string;
  let productIdB: string;

  /** Del uploadUrl absoluto sólo sirve el path: supertest habla con la app, no con la red. */
  const toPath = (url: string) => {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  };

  const setModules = async (companyId: string, value: string) => {
    await prisma.$executeRaw`UPDATE companies SET "enabledModules" = ${value} WHERE id = ${companyId}`;
    invalidateModuleCache(companyId);
  };

  beforeAll(async () => {
    const product = await api
      .post('/api/products')
      .set(auth(ADMIN_A))
      .send({ sku: `IMG-${Date.now()}`, name: 'Producto con foto (test)', cost: 100, price: 200, taxRate: 21 });
    expectStatus(product, 201);
    productId = product.body.data.id;

    const productB = await api
      .post('/api/products')
      .set(auth(ADMIN_B))
      .send({ sku: `IMGB-${Date.now()}`, name: 'Producto empresa B (test)', cost: 100, price: 200, taxRate: 21 });
    expectStatus(productB, 201);
    productIdB = productB.body.data.id;
  });

  afterAll(async () => {
    await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
    // Los archivos de test comparten la DB: dejar los módulos como estaban.
    await setModules(COMPANY_A, 'ALL');
    await setModules(COMPANY_B, 'ALL');
  });

  it('rechaza la subida si la empresa no tiene el módulo (ni siquiera con "ALL")', async () => {
    // 'ALL' no cubre los módulos opt-in: sin esto, todas las empresas ya
    // existentes tendrían el módulo prendido de un día para el otro.
    await setModules(COMPANY_A, 'ALL');

    const res = await api
      .post(`/api/products/${productId}/image/upload-url`)
      .set(auth(ADMIN_A))
      .send({ contentType: 'image/webp', size: 1024 });
    expectStatus(res, 403);
  });

  describe('con el módulo habilitado', () => {
    beforeAll(async () => {
      await setModules(COMPANY_A, 'ventas,catalogo,compras,finanzas,imagenes');
      await setModules(COMPANY_B, 'ventas,catalogo,compras,finanzas,imagenes');
    });

    it('rechaza formatos que no son imagen', async () => {
      const res = await api
        .post(`/api/products/${productId}/image/upload-url`)
        .set(auth(ADMIN_A))
        .send({ contentType: 'application/pdf', size: 1024 });
      expectStatus(res, 400);
    });

    it('rechaza archivos por encima del máximo', async () => {
      const res = await api
        .post(`/api/products/${productId}/image/upload-url`)
        .set(auth(ADMIN_A))
        .send({ contentType: 'image/webp', size: 50 * 1024 * 1024 });
      expectStatus(res, 400);
    });

    it('sube, confirma y sirve la imagen', async () => {
      const presign = await api
        .post(`/api/products/${productId}/image/upload-url`)
        .set(auth(ADMIN_A))
        .send({ contentType: 'image/webp', size: 1024 });
      expectStatus(presign, 200);

      const { uploadUrl, key, publicUrl } = presign.body.data;
      expect(key).toMatch(new RegExp(`^products/${COMPANY_A}/${productId}/[0-9a-f-]+\\.webp$`));

      const bytes = Buffer.from('fake-webp-bytes');
      const put = await api.put(toPath(uploadUrl)).set('Content-Type', 'image/webp').send(bytes);
      expectStatus(put, 200);

      const confirm = await api
        .put(`/api/products/${productId}/image`)
        .set(auth(ADMIN_A))
        .send({ key });
      expectStatus(confirm, 200);
      expect(confirm.body.data.imageUrl).toBe(publicUrl);

      // La imagen tiene que venir también en el GET del producto y en el listado.
      const detail = await api.get(`/api/products/${productId}`).set(auth(ADMIN_A));
      expectStatus(detail, 200);
      expect(detail.body.data.imageUrl).toBe(publicUrl);

      const served = await api.get(toPath(publicUrl));
      expectStatus(served, 200);
      expect(served.headers['content-type']).toContain('image/webp');
      expect(served.body).toEqual(bytes);
    });

    it('borra la imagen anterior del storage al reemplazarla', async () => {
      const before = await api.get(`/api/products/${productId}`).set(auth(ADMIN_A));
      const oldPath = toPath(before.body.data.imageUrl);

      const presign = await api
        .post(`/api/products/${productId}/image/upload-url`)
        .set(auth(ADMIN_A))
        .send({ contentType: 'image/png', size: 1024 });
      expectStatus(presign, 200);

      await api
        .put(toPath(presign.body.data.uploadUrl))
        .set('Content-Type', 'image/png')
        .send(Buffer.from('otra-imagen'));
      const confirm = await api
        .put(`/api/products/${productId}/image`)
        .set(auth(ADMIN_A))
        .send({ key: presign.body.data.key });
      expectStatus(confirm, 200);

      // El objeto viejo ya no existe: si no lo borráramos, seguiría facturando.
      expectStatus(await api.get(oldPath), 404);
      expectStatus(await api.get(toPath(presign.body.data.publicUrl)), 200);
    });

    it('no deja confirmar con la key de un producto de otra empresa', async () => {
      const presignB = await api
        .post(`/api/products/${productIdB}/image/upload-url`)
        .set(auth(ADMIN_B))
        .send({ contentType: 'image/webp', size: 1024 });
      expectStatus(presignB, 200);

      const res = await api
        .put(`/api/products/${productId}/image`)
        .set(auth(ADMIN_A))
        .send({ key: presignB.body.data.key });
      expectStatus(res, 403);
    });

    it('no deja pedir una URL para un producto de otra empresa', async () => {
      const res = await api
        .post(`/api/products/${productIdB}/image/upload-url`)
        .set(auth(ADMIN_A))
        .send({ contentType: 'image/webp', size: 1024 });
      expectStatus(res, 404);
    });

    it('rechaza una URL de subida con la firma alterada', async () => {
      const presign = await api
        .post(`/api/products/${productId}/image/upload-url`)
        .set(auth(ADMIN_A))
        .send({ contentType: 'image/webp', size: 1024 });
      expectStatus(presign, 200);

      const tampered = toPath(presign.body.data.uploadUrl).replace(/sig=[0-9a-f]+/, 'sig=' + '0'.repeat(64));
      expectStatus(await api.put(tampered).set('Content-Type', 'image/webp').send(Buffer.from('x')), 403);
    });

    it('elimina la imagen y su objeto', async () => {
      const before = await api.get(`/api/products/${productId}`).set(auth(ADMIN_A));
      const servedPath = toPath(before.body.data.imageUrl);

      const res = await api.delete(`/api/products/${productId}/image`).set(auth(ADMIN_A));
      expectStatus(res, 200);
      expect(res.body.data.imageUrl).toBeNull();

      expectStatus(await api.get(servedPath), 404);
    });
  });
});
