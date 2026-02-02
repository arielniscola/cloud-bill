import { injectable } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import {
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from '../../../domain/entities/Stock';
import prisma from '../prisma';

@injectable()
export class PrismaWarehouseRepository implements IWarehouseRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  async findAll(): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findDefault(): Promise<Warehouse | null> {
    return this.prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });
  }

  async create(data: CreateWarehouseInput): Promise<Warehouse> {
    if (data.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.warehouse.create({ data });
  }

  async update(id: string, data: UpdateWarehouseInput): Promise<Warehouse> {
    if (data.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.warehouse.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.warehouse.delete({ where: { id } });
  }
}
