export interface AppSettings {
  id: string;
  defaultBudgetCashRegisterId:  string | null;
  defaultInvoiceCashRegisterId: string | null;
  deadStockDays:                number;
  safetyStockDays:              number;
  stalePriceWarnDays1:          number;
  stalePriceWarnDays2:          number;
  companyTaxCondition:          string;
  printFormat:                  string;
  smtpHost:                     string | null;
  smtpPort:                     number;
  smtpUser:                     string | null;
  smtpPass:                     string | null;
  smtpFrom:                     string | null;
  smtpSecure:                   boolean;
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
  stalePriceWarnDays1?:          number;
  stalePriceWarnDays2?:          number;
  companyTaxCondition?:          string;
  printFormat?:                  string;
  smtpHost?:                     string | null;
  smtpPort?:                     number;
  smtpUser?:                     string | null;
  smtpPass?:                     string | null;
  smtpFrom?:                     string | null;
  smtpSecure?:                   boolean;
}
