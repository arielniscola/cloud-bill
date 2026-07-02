/**
 * IDs fijos sembrados por globalSetup. Dos empresas para poder verificar
 * el aislamiento multi-tenant.
 */
export const COMPANY_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
export const COMPANY_B = 'bbbbbbbb-0000-4000-8000-00000000000b';

export const TEST_PASSWORD = 'Test1234!';

export const ADMIN_A = {
  id: 'aaaaaaaa-1111-4000-8000-000000000001',
  username: 'admin.a',
  name: 'Admin Empresa A',
  role: 'ADMIN' as const,
  companyId: COMPANY_A,
};

export const SELLER_A = {
  id: 'aaaaaaaa-2222-4000-8000-000000000002',
  username: 'seller.a',
  name: 'Vendedor Empresa A',
  role: 'SELLER' as const,
  companyId: COMPANY_A,
};

export const ADMIN_B = {
  id: 'bbbbbbbb-1111-4000-8000-000000000001',
  username: 'admin.b',
  name: 'Admin Empresa B',
  role: 'ADMIN' as const,
  companyId: COMPANY_B,
};
