import prisma from '../../database/prisma';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';

// Los ids que llegan en el body o en la URL (cuenta bancaria, depósito,
// producto, usuario…) apuntan a registros de alguna empresa: antes de usarlos
// hay que confirmar que son de la empresa del request. Validar solo el
// documento principal no alcanza — con el id de una cuenta bancaria ajena, un
// cobro terminaba moviendo el saldo de otra empresa.

async function existsInCompany(table: 'bank_accounts' | 'warehouses' | 'products' | 'users', id: string, companyId: string): Promise<boolean> {
  // El nombre de tabla sale de la unión de literales de arriba, nunca del request.
  const rows = await prisma.$queryRawUnsafe<{ ok: number }[]>(
    `SELECT 1 AS ok FROM "${table}" WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    id,
    companyId
  );
  return rows.length > 0;
}

/** Cuenta bancaria elegida en un cobro/pago/depósito. 400: es un dato del body. */
export async function assertBankAccountInCompany(id: string | null | undefined, companyId: string | undefined): Promise<void> {
  if (!id) return;
  if (!companyId || !(await existsInCompany('bank_accounts', id, companyId))) {
    throw new AppError('Cuenta bancaria no encontrada', 400);
  }
}

/** Depósito de la URL: 404 como cualquier recurso inexistente. */
export async function assertWarehouseInCompany(id: string, companyId: string | undefined): Promise<void> {
  if (!companyId || !(await existsInCompany('warehouses', id, companyId))) {
    throw new NotFoundError('Depósito');
  }
}

/** Producto de la URL. */
export async function assertProductInCompany(id: string, companyId: string | undefined): Promise<void> {
  if (!companyId || !(await existsInCompany('products', id, companyId))) {
    throw new NotFoundError('Producto');
  }
}

/** Usuario elegido en el body (p.ej. a quién se le asigna un punto de venta). */
export async function assertUserInCompany(id: string, companyId: string | undefined): Promise<void> {
  if (!companyId || !(await existsInCompany('users', id, companyId))) {
    throw new AppError('Usuario no encontrado', 400);
  }
}
