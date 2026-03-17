import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Company } from '../types/company.types';

interface CompanyState {
  companies: Company[];
  activeCompanyId: string | null;
  setCompanies: (companies: Company[]) => void;
  setActiveCompany: (id: string) => void;
  clearCompany: () => void;
  activeCompany: () => Company | null;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set, get) => ({
      companies: [],
      activeCompanyId: null,
      setCompanies: (companies) => set({ companies }),
      setActiveCompany: (id) => set({ activeCompanyId: id }),
      clearCompany: () => set({ activeCompanyId: null, companies: [] }),
      activeCompany: () => {
        const { companies, activeCompanyId } = get();
        return companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;
      },
    }),
    { name: 'cloud-bill-company' }
  )
);
