export interface PuntoDeVenta {
  id: string;
  number: number;      // AFIP PdV number (1-9999)
  name: string;
  companyId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // populated on findAll
  assignedUsers?: { id: string; name: string; username: string }[];
}

export interface CreatePdvInput {
  number: number;
  name: string;
  companyId: string;
}

export interface UpdatePdvInput {
  name?: string;
  isActive?: boolean;
}

export interface PdvCounter {
  id: string;
  pdvId: string;
  invoiceType: string;
  lastNumber: number;
  syncedFromAfip: boolean;
}
