import { injectable } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { ICategoryRepository } from '../../../domain/repositories/ICategoryRepository';
import { Category, CreateCategoryInput, UpdateCategoryInput } from '../../../domain/entities/Category';
import prisma from '../prisma';

@injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findByParentId(parentId: string | null): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { parentId },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateCategoryInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }
}
