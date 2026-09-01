import { Cheque, CreateChequeInput, ChequeStatus } from '../entities/Cheque';
import { Prisma } from '@prisma/client';

export interface ChequeFilters {
  companyId:   string;
  type?:       string;
  status?:     string;
  customerId?: string;
  supplierId?: string;
  fiscalMode?: string;
  page?:       number;
  limit?:      number;
}

export interface IChequeRepository {
  findAll(filters: ChequeFilters): Promise<{ data: Cheque[]; total: number }>;
  findById(id: string, companyId: string): Promise<Cheque | null>;
  create(
    data: CreateChequeInput & { userId: string; companyId: string },
    tx?: Prisma.TransactionClient
  ): Promise<Cheque>;
  updateStatus(id: string, status: ChequeStatus, companyId: string): Promise<Cheque>;
  delete(id: string, companyId: string): Promise<void>;
  nextNumber(companyId: string, tx?: Prisma.TransactionClient): Promise<string>;
}
