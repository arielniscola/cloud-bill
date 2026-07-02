import { api, expectStatus } from '../helpers';
import { ADMIN_A, TEST_PASSWORD } from '../fixtures';

describe('Flujo crítico: autenticación', () => {
  it('login con credenciales válidas devuelve token y datos del usuario', async () => {
    const res = await api
      .post('/api/auth/login')
      .send({ username: ADMIN_A.username, password: TEST_PASSWORD });

    expectStatus(res, 200);
    expect(res.body.status).toBe('success');
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.length).toBeGreaterThan(20);
  });

  it('login con contraseña incorrecta es rechazado', async () => {
    const res = await api
      .post('/api/auth/login')
      .send({ username: ADMIN_A.username, password: 'incorrecta-123' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.status).toBe('error');
    expect(res.body.data?.token).toBeUndefined();
  });

  it('un endpoint protegido sin token devuelve 401', async () => {
    const res = await api.get('/api/customers');
    expectStatus(res, 401);
  });

  it('el registro NO es público: sin token 401, y un ADMIN tampoco puede crear usuarios por ahí', async () => {
    const body = { username: 'intruso', password: 'Password1!', name: 'Intruso', role: 'SUPER_ADMIN' };

    const anon = await api.post('/api/auth/register').send(body);
    expectStatus(anon, 401);

    const { auth } = await import('../helpers');
    const asAdmin = await api.post('/api/auth/register').set(auth(ADMIN_A)).send(body);
    expectStatus(asAdmin, 403);
  });
});
