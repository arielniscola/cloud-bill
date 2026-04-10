import api from './api';
import type { Card, CreateCardDTO, UpdateCardDTO } from '../types/card.types';

const cardsService = {
  async getAll(): Promise<Card[]> {
    const res = await api.get<{ status: string; data: Card[] }>('/cards');
    return res.data.data;
  },

  async getById(id: string): Promise<Card> {
    const res = await api.get<{ status: string; data: Card }>(`/cards/${id}`);
    return res.data.data;
  },

  async create(data: CreateCardDTO): Promise<Card> {
    const res = await api.post<{ status: string; data: Card }>('/cards', data);
    return res.data.data;
  },

  async update(id: string, data: UpdateCardDTO): Promise<Card> {
    const res = await api.put<{ status: string; data: Card }>(`/cards/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/cards/${id}`);
  },
};

export default cardsService;
