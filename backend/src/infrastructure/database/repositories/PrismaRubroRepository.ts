import { injectable } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { IRubroRepository } from '../../../domain/repositories/IRubroRepository';
import { Rubro, CreateRubroInput, UpdateRubroInput } from '../../../domain/entities/Rubro';
import prisma from '../prisma';

@injectable()
export class PrismaRubroRepository implements IRubroRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string, companyId?: string): Promise<Rubro | null> {
    return this.prisma.rubro.findFirst({
      where: { id, ...(companyId ? ({ companyId } as any) : {}) },
    });
  }

  async findAll(companyId?: string): Promise<Rubro[]> {
    return this.prisma.rubro.findMany({
      where: companyId ? ({ companyId } as any) : undefined,
      orderBy: { name: 'asc' },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findByParentId(parentId: string | null): Promise<Rubro[]> {
    return this.prisma.rubro.findMany({
      where: { parentId },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateRubroInput & { companyId?: string }): Promise<Rubro> {
    return this.prisma.rubro.create({ data: data as any });
  }

  async update(id: string, data: UpdateRubroInput): Promise<Rubro> {
    return this.prisma.rubro.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.rubro.delete({ where: { id } });
  }
}
