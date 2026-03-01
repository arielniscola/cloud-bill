export interface AppSettings {
  id: string;
  defaultBudgetCashRegisterId:  string | null;
  defaultInvoiceCashRegisterId: string | null;
  deadStockDays:                number;
  safetyStockDays:              number;
  createdAt: Date;
  updatedAt: Date;
  defaultBudgetCashRegister?:  { id: string; name: string } | null;
  defaultInvoiceCashRegister?: { id: string; name: string } | null;
}

export interface UpdateAppSettingsInput {
  defaultBudgetCashRegisterId?:  string | null;
  defaultInvoiceCashRegisterId?: string | null;
  deadStockDays?:                number;
  safetyStockDays?:              number;
}
