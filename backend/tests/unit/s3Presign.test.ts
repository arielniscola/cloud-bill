import { S3CompatibleStorageService } from '../../src/infrastructure/storage/S3CompatibleStorageService';

/**
 * La firma SigV4 está implementada a mano (ver el comentario del servicio), así
 * que se valida contra el vector oficial de AWS: "Example: Signature Calculation
 * for Presigned URL" de la Signature Version 4 API Reference, cuyo resultado
 * publicado es la firma esperada de más abajo. Si algún día cambiamos algo del
 * canonical request, este test se cae antes de que falle una subida real.
 */
describe('S3CompatibleStorageService — SigV4', () => {
  const service = new S3CompatibleStorageService({
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    bucket: 'examplebucket',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    publicBaseUrl: 'https://cdn.example.com',
    forcePathStyle: false, // el vector usa virtual-hosted: examplebucket.s3.amazonaws.com
  });

  const FIXED_NOW = new Date('2013-05-24T00:00:00.000Z');
  let spy: jest.SpyInstance;

  beforeAll(() => {
    spy = jest.spyOn(global, 'Date').mockImplementation(() => FIXED_NOW as any) as any;
  });
  afterAll(() => spy.mockRestore());

  it('reproduce la firma del vector oficial de AWS', () => {
    // El vector es un GET; sign() es privado y su tipo sólo admite PUT/DELETE,
    // pero el método es un string en el canonical request.
    const url: string = (service as any).sign('GET', 'test.txt', 86400);

    expect(url).toContain('https://examplebucket.s3.amazonaws.com/test.txt?');
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain(
      'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request'
    );
    expect(url).toContain('X-Amz-Date=20130524T000000Z');
    expect(url).toContain('X-Amz-Expires=86400');
    expect(url).toContain('X-Amz-SignedHeaders=host');
    expect(url).toContain(
      'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'
    );
  });

  it('usa path-style cuando está configurado así', () => {
    const pathStyle = new S3CompatibleStorageService({
      endpoint: 'https://abc123.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'cloudbill',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      publicBaseUrl: 'https://cdn.example.com',
      forcePathStyle: true,
    });
    const url: string = (pathStyle as any).sign('PUT', 'products/c1/p1/img.webp', 300);
    expect(url).toContain(
      'https://abc123.r2.cloudflarestorage.com/cloudbill/products/c1/p1/img.webp?'
    );
  });

  it('escapa los caracteres especiales de la key en la URL pública', () => {
    expect(service.publicUrl('products/c1/p1/a b(1).webp')).toBe(
      'https://cdn.example.com/products/c1/p1/a%20b%281%29.webp'
    );
  });
});
