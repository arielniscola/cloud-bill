export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseDTO {
  name: string;
  address?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export type UpdateWarehouseDTO = Partial<CreateWarehouseDTO>;
