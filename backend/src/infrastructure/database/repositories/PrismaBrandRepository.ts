import { injectable } from 'tsyringe';
import { IBrandRepository } from '../../../domain/repositories/IBrandRepository';
import { Brand, CreateBrandInput, UpdateBrandInput } from '../../../domain/entities/Brand';
import prisma from '../prisma';

@injectable()
export class PrismaBrandRepository implements IBrandRepository {
  async findById(id: string): Promise<Brand | null> {
    return (prisma as any).brand.findUnique({ where: { id } });
  }

  async findAll(): Promise<Brand[]> {
    return (prisma as any).brand.findMany({ orderBy: { name: 'asc' } });
  }

  async create(data: CreateBrandInput): Promise<Brand> {
    return (prisma as any).brand.create({ data });
  }

  async update(id: string, data: UpdateBrandInput): Promise<Brand> {
    return (prisma as any).brand.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).brand.delete({ where: { id } });
  }
}
