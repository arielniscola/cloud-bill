export interface AppSettings {
  id: string;
  defaultInvoiceCashRegisterId: string | null;
  defaultBudgetCashRegisterId?: string | null;
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
  defaultInvoiceCashRegister?:  { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateAppSettingsDTO {
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
