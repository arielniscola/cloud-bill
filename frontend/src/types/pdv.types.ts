export interface PuntoDeVenta {
  id: string;
  number: number;
  name: string;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  assignedUsers?: { id: string; name: string; username: string }[];
}

export interface CreatePdvDTO {
  number: number;
  name: string;
}

export interface UpdatePdvDTO {
  name?: string;
  isActive?: boolean;
}
