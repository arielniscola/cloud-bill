import { injectable } from 'tsyringe';
import { IRubroRepository } from '../../../domain/repositories/IRubroRepository';
import { Rubro, CreateRubroInput, UpdateRubroInput } from '../../../domain/entities/Rubro';
import prisma from '../prisma';

@injectable()
export class PrismaRubroRepository implements IRubroRepository {
  async findAll(companyId?: string): Promise<Rubro[]> {
    return (prisma as any).rubro.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<Rubro | null> {
    return (prisma as any).rubro.findUnique({ where: { id } });
  }

  async create(data: CreateRubroInput): Promise<Rubro> {
    return (prisma as any).rubro.create({ data });
  }

  async update(id: string, data: UpdateRubroInput): Promise<Rubro> {
    return (prisma as any).rubro.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await (prisma as any).rubro.delete({ where: { id } });
  }
}
