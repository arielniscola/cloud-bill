export interface Provincia {
  id: string;
  name: string;
  /** Código de provincia de ARCA (padrón `idProvincia`). */
  afipCode: number | null;
  /** Código de jurisdicción del Convenio Multilateral (901…924). */
  jurisdictionCode: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProvinciaDTO {
  name: string;
  afipCode?: number | null;
  jurisdictionCode?: string | null;
  isActive?: boolean;
}

export type UpdateProvinciaDTO = Partial<CreateProvinciaDTO>;
