import { injectable } from 'tsyringe';
import { IAfipConfigRepository } from '../../../domain/repositories/IAfipConfigRepository';
import { AfipConfig, CreateAfipConfigInput } from '../../../domain/entities/AfipConfig';
import prisma from '../prisma';

async function withActivityDate(config: any): Promise<AfipConfig> {
  if (!config) return config;
  const rows = await prisma.$queryRaw<{ activityStartDate: Date | null }[]>`
    SELECT "activityStartDate" FROM afip_config WHERE id = ${config.id}
  `;
  return { ...config, activityStartDate: rows[0]?.activityStartDate ?? null };
}

@injectable()
export class PrismaAfipConfigRepository implements IAfipConfigRepository {
  async getActive(): Promise<AfipConfig | null> {
    const config = await prisma.afipConfig.findFirst({ where: { isActive: true } });
    if (!config) return null;
    return withActivityDate(config);
  }

  async upsert(data: CreateAfipConfigInput): Promise<AfipConfig> {
    const existing = await prisma.afipConfig.findFirst({ where: { isActive: true } });

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
      const { activityStartDate: _asd, ...rest } = data as any;
      config = await prisma.afipConfig.create({ data: rest });
    }

    // Set activityStartDate via raw SQL (stale Prisma client workaround)
    if (data.activityStartDate !== undefined) {
      if (data.activityStartDate) {
        await prisma.$executeRaw`
          UPDATE afip_config SET "activityStartDate" = ${data.activityStartDate} WHERE id = ${config.id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE afip_config SET "activityStartDate" = NULL WHERE id = ${config.id}
        `;
      }
    }

    return withActivityDate(config);
  }
}
