export interface AppSettings {
  id: string;
  defaultBudgetCashRegisterId:  string | null;
  defaultInvoiceCashRegisterId: string | null;
  deadStockDays:                number;
  safetyStockDays:              number;
  defaultBudgetCashRegister?:   { id: string; name: string } | null;
  defaultInvoiceCashRegister?:  { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateAppSettingsDTO {
  defaultBudgetCashRegisterId?:  string | null;
  defaultInvoiceCashRegisterId?: string | null;
  deadStockDays?:                number;
  safetyStockDays?:              number;
}
