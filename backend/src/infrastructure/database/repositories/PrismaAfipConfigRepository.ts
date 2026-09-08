import { injectable } from 'tsyringe';
import { IAfipConfigRepository } from '../../../domain/repositories/IAfipConfigRepository';
import { AfipConfig, CreateAfipConfigInput } from '../../../domain/entities/AfipConfig';
import prisma from '../prisma';

/**
 * Columnas que el cliente Prisma generado puede no conocer todavía (patrón recurrente
 * del proyecto: se agregan por migración manual y el client queda desactualizado).
 * Se leen y escriben siempre por SQL crudo para no depender del `prisma generate`.
 */
interface ExtraColumns {
  activityStartDate: Date | null;
  grossIncome: string | null;
  consumerDefensePhone: string | null;
}

async function withExtraColumns(config: any): Promise<AfipConfig> {
  if (!config) return config;
  const rows = await prisma.$queryRaw<ExtraColumns[]>`
    SELECT "activityStartDate", "grossIncome", "consumerDefensePhone"
    FROM afip_config WHERE id = ${config.id}
  `;
  return {
    ...config,
    activityStartDate:    rows[0]?.activityStartDate    ?? null,
    grossIncome:          rows[0]?.grossIncome          ?? null,
    consumerDefensePhone: rows[0]?.consumerDefensePhone ?? null,
  };
}

/**
 * El certificado y la clave privada de ARCA son datos fiscales de UNA empresa.
 * Sin `companyId` la consulta devolvía la primera config activa de la tabla, es
 * decir la de otra empresa. Fallamos fuerte en vez de caer a un default.
 */
function assertCompanyId(companyId: string | undefined | null): asserts companyId is string {
  if (!companyId) {
    throw new Error('companyId es obligatorio para acceder a la configuración de ARCA');
  }
}

@injectable()
export class PrismaAfipConfigRepository implements IAfipConfigRepository {
  async getActive(companyId: string): Promise<AfipConfig | null> {
    assertCompanyId(companyId);
    const config = await prisma.afipConfig.findFirst({
      where: { isActive: true, companyId },
    });
    if (!config) return null;
    return withExtraColumns(config);
  }

  async upsert(data: CreateAfipConfigInput, companyId: string): Promise<AfipConfig> {
    assertCompanyId(companyId);
    const existing = await prisma.afipConfig.findFirst({
      where: { isActive: true, companyId },
    });

    let config: any;
    if (existing) {
      const updateData: any = {
        cuit:            data.cuit,
        salePoint:       data.salePoint,
        businessName:    data.businessName,
        businessAddress: data.businessAddress,
        taxCondition:    data.taxCondition,
        isProduction:    data.isProduction,
      };
      if (data.cert)       updateData.cert       = data.cert;
      if (data.privateKey) updateData.privateKey = data.privateKey;
      config = await prisma.afipConfig.update({ where: { id: existing.id }, data: updateData });
    } else {
      const {
        activityStartDate: _asd,
        grossIncome: _gi,
        consumerDefensePhone: _cdp,
        ...rest
      } = data as any;
      config = await prisma.afipConfig.create({ data: { ...rest, companyId } });
    }

    // Columnas fuera del client generado — se escriben por SQL crudo.
    if (data.activityStartDate !== undefined) {
      await prisma.$executeRaw`
        UPDATE afip_config SET "activityStartDate" = ${data.activityStartDate ?? null} WHERE id = ${config.id}
      `;
    }
    if (data.grossIncome !== undefined) {
      await prisma.$executeRaw`
        UPDATE afip_config SET "grossIncome" = ${data.grossIncome || null} WHERE id = ${config.id}
      `;
    }
    if (data.consumerDefensePhone !== undefined) {
      await prisma.$executeRaw`
        UPDATE afip_config SET "consumerDefensePhone" = ${data.consumerDefensePhone || null} WHERE id = ${config.id}
      `;
    }

    return withExtraColumns(config);
  }
}
