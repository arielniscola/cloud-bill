import { injectable } from 'tsyringe';
import { IAfipConfigRepository } from '../../../domain/repositories/IAfipConfigRepository';
import { AfipConfig, CreateAfipConfigInput } from '../../../domain/entities/AfipConfig';
import prisma from '../prisma';

@injectable()
export class PrismaAfipConfigRepository implements IAfipConfigRepository {
  async getActive(): Promise<AfipConfig | null> {
    return prisma.afipConfig.findFirst({ where: { isActive: true } });
  }

  async upsert(data: CreateAfipConfigInput): Promise<AfipConfig> {
    const existing = await prisma.afipConfig.findFirst({ where: { isActive: true } });

    if (existing) {
      return prisma.afipConfig.update({
        where: { id: existing.id },
        data: {
          cuit: data.cuit,
          salePoint: data.salePoint,
          cert: data.cert,
          privateKey: data.privateKey,
          isProduction: data.isProduction,
        },
      });
    }

    return prisma.afipConfig.create({ data });
  }
}
