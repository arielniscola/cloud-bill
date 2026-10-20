export interface Provincia {
  id: string;
  name: string;
  afipCode: number | null;
  jurisdictionCode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProvinciaInput {
  name: string;
  afipCode?: number | null;
  jurisdictionCode?: string | null;
  isActive?: boolean;
  companyId: string;
}

export interface UpdateProvinciaInput {
  name?: string;
  afipCode?: number | null;
  jurisdictionCode?: string | null;
  isActive?: boolean;
}
