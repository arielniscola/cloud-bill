export interface Localidad {
  id: string;
  name: string;
  provinciaId: string | null;
  /** Nombre de la provincia del catálogo (join). */
  provinciaName: string | null;
  postalCode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocalidadDTO {
  name: string;
  provinciaId?: string | null;
  postalCode?: string | null;
  isActive?: boolean;
}

export type UpdateLocalidadDTO = Partial<CreateLocalidadDTO>;
