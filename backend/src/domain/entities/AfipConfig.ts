export interface AfipConfig {
  id: string;
  cuit: string;
  salePoint: number;
  cert: string;
  privateKey: string;
  isProduction: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAfipConfigInput {
  cuit: string;
  salePoint: number;
  cert: string;
  privateKey: string;
  isProduction: boolean;
}
