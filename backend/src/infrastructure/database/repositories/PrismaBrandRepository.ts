import { injectable } from 'tsyringe';
import { IBrandRepository } from '../../../domain/repositories/IBrandRepository';
import { Brand, CreateBrandInput, UpdateBrandInput } from '../../../domain/entities/Brand';
import prisma from '../prisma';

@injectable()
export class PrismaBrandRepository implements IBrandRepository {
  async findById(id: string, companyId?: string): Promise<Brand | null> {
    return (prisma as any).brand.findFirst({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
  }

  async findAll(companyId?: string): Promise<Brand[]> {
    return (prisma as any).brand.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateBrandInput & { companyId?: string }): Promise<Brand> {
    return (prisma as any).brand.create({ data });
  }

  async update(id: string, data: UpdateBrandInput): Promise<Brand> {
    return (prisma as any).brand.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).brand.delete({ where: { id } });
  }
}
