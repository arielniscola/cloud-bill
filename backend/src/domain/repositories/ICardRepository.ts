import { Card, CreateCardInput, UpdateCardInput } from '../entities/Card';

export interface ICardRepository {
  findAll(companyId: string): Promise<Card[]>;
  findById(id: string): Promise<Card | null>;
  create(data: CreateCardInput): Promise<Card>;
  update(id: string, data: UpdateCardInput): Promise<Card>;
  delete(id: string): Promise<void>;
}
