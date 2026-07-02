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
  printFormatInvoice?:          string;
  printFormatBudget?:           string;
  printFormatOrdenPedido?:      string;
  printFormatRemito?:           string;
  printFormatRecibo?:           string;
  smtpHost:                     string | null;
  smtpPort:                     number;
  smtpUser:                     string | null;
  smtpPass:                     string | null;
  smtpFrom:                     string | null;
  smtpSecure:                   boolean;
  mpAccessToken:                string | null;
  mpPublicKey:                  string | null;
  mpWebhookSecret:              string | null;
  mpMode:                       'test' | 'production';
  mpPosId:                      string | null;
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
  printFormatInvoice?:           string;
  printFormatBudget?:            string;
  printFormatOrdenPedido?:       string;
  printFormatRemito?:            string;
  printFormatRecibo?:            string;
  smtpHost?:                     string | null;
  smtpPort?:                     number;
  smtpUser?:                     string | null;
  smtpPass?:                     string | null;
  smtpFrom?:                     string | null;
  smtpSecure?:                   boolean;
  mpAccessToken?:                string | null;
  mpPublicKey?:                  string | null;
  mpWebhookSecret?:              string | null;
  mpMode?:                       'test' | 'production';
  mpPosId?:                      string | null;
}
