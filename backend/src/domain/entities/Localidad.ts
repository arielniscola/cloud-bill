export interface Localidad {
  id: string;
  name: string;
  provinciaId: string | null;
  /** Nombre de la provincia (join con `provincias`). */
  provinciaName: string | null;
  postalCode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLocalidadInput {
  name: string;
  provinciaId?: string | null;
  postalCode?: string | null;
  isActive?: boolean;
  companyId: string;
}

export interface UpdateLocalidadInput {
  name?: string;
  provinciaId?: string | null;
  postalCode?: string | null;
  isActive?: boolean;
}
