export interface Rubro {
  id: string;
  name: string;
  parentId: string | null;
  parent?: Rubro;
  children?: Rubro[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRubroDTO {
  name: string;
  parentId?: string | null;
}

export interface UpdateRubroDTO extends Partial<CreateRubroDTO> {}
