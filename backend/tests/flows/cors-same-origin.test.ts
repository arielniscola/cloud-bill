import { api } from '../helpers';

describe('CORS: instalación local abierta desde otra PC de la red', () => {
  it('acepta el pedido cuando el Origin coincide con el Host', async () => {
    const res = await api
      .get('/api/health')
      .set('Host', '192.168.1.50')
      .set('Origin', 'http://192.168.1.50');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://192.168.1.50');
  });

  it('rechaza un Origin ajeno aunque apunte al mismo Host', async () => {
    const res = await api
      .get('/api/health')
      .set('Host', '192.168.1.50')
      .set('Origin', 'http://otro-sitio.example');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
