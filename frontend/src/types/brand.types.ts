export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrandDTO {
  name: string;
  isActive?: boolean;
}

export interface UpdateBrandDTO extends Partial<CreateBrandDTO> {}
