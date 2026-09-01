import { Prisma } from '@prisma/client';
import { Chequera, CreateChequeraInput, UpdateChequeraInput } from '../entities/Chequera';

export interface IChequeraRepository {
  findAll(companyId: string): Promise<Chequera[]>;
  findById(id: string, companyId: string): Promise<Chequera | null>;
  create(data: CreateChequeraInput): Promise<Chequera>;
  update(id: string, companyId: string, data: UpdateChequeraInput): Promise<Chequera>;
  delete(id: string, companyId: string): Promise<void>;
  // Returns the next check number and advances the counter (atomic-ish). null if no counter set.
  consumeNextNumber(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<number | null>;
}
