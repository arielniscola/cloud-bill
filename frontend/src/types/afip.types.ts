export interface AfipConfigSummary {
  id: string;
  cuit: string;
  salePoint: number;
  businessName: string | null;
  businessAddress: string | null;
  taxCondition: string | null;
  activityStartDate: string | null;
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
  businessName?: string;
  businessAddress?: string;
  taxCondition?: string;
  activityStartDate?: string;
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
