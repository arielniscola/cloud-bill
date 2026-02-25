export interface AfipConfigSummary {
  id: string;
  cuit: string;
  salePoint: number;
  isProduction: boolean;
  isActive: boolean;
  hasCert: boolean;
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AfipConfigDTO {
  cuit: string;
  salePoint: number;
  cert: string;
  privateKey: string;
  isProduction: boolean;
}

export interface EmitResult {
  cae: string;
  caeExpiry: string;
  afipCbtNum: number;
  afipPtVenta: number;
}
