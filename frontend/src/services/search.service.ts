import api from './api';

export interface SearchResult {
  invoices: Array<{ id: string; number: string; type: string; status: string; total: number; date: string; customer: { id: string; name: string } | null }>;
  customers: Array<{ id: string; name: string; taxId: string | null; email: string | null }>;
  products: Array<{ id: string; name: string; sku: string | null; price: number }>;
  budgets: Array<{ id: string; number: string; status: string; total: number; date: string; customer: { id: string; name: string } | null }>;
}

export const searchService = {
  async search(q: string): Promise<SearchResult> {
    const res = await api.get<{ status: string; data: SearchResult }>('/search', { params: { q } });
    return res.data.data;
  },
};
