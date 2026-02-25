import { injectable } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { ICashRegisterRepository } from '../../../domain/repositories/ICashRegisterRepository';
import { CashRegister, CreateCashRegisterInput, UpdateCashRegisterInput } from '../../../domain/entities/CashRegister';
import prisma from '../prisma';

@injectable()
export class PrismaCashRegisterRepository implements ICashRegisterRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findById(id: string): Promise<CashRegister | null> {
    return this.prisma.cashRegister.findUnique({ where: { id } });
  }

  async findAll(onlyActive = false): Promise<CashRegister[]> {
    return this.prisma.cashRegister.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateCashRegisterInput): Promise<CashRegister> {
    return this.prisma.cashRegister.create({ data });
  }

  async update(id: string, data: UpdateCashRegisterInput): Promise<CashRegister> {
    return this.prisma.cashRegister.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.cashRegister.delete({ where: { id } });
  }
}
