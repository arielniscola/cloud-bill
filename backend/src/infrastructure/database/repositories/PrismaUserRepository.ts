import { injectable } from 'tsyringe';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User, CreateUserInput, UpdateUserInput } from '../../../domain/entities/User';
import prisma from '../prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (prisma as any);

@injectable()
export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } }) as Promise<User | null>;
  }

  async findByUsername(username: string): Promise<User | null> {
    return db.user.findUnique({ where: { username } }) as Promise<User | null>;
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!email) return null;
    return prisma.user.findFirst({ where: { email } }) as Promise<User | null>;
  }

  async findAll(filters?: { companyId?: string }): Promise<User[]> {
    const where: Record<string, unknown> = {};
    if (filters?.companyId) where.companyId = filters.companyId;
    return prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    }) as Promise<User[]>;
  }

  async create(data: CreateUserInput): Promise<User> {
    return db.user.create({ data }) as Promise<User>;
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    return db.user.update({ where: { id }, data }) as Promise<User>;
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
